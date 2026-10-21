import { randomUUID } from 'node:crypto';

import type { Logger } from 'pino';
import {
  PRIOR_COURSE_LIMIT,
  SESSION_DRAFT_TTL_DAYS,
  SESSION_SCHEMA_VERSION,
  type CreateSessionRequest,
  type SessionData,
  type SessionSummary,
  type UpdateSessionInputsRequest,
} from '@ccb/contracts';

import { SessionError } from '../domain/session-errors.js';
import {
  canApproveOutline,
  canEditInputs,
  canPause,
  canRegenerateOutline,
  canResume,
  canStartOutline,
  canStop,
  expansionStarted,
  isActiveSession,
  isInProgressSession,
  resumeAction,
  toSessionSummary,
} from '../domain/session-state.js';
import { buildStartingPrompt } from '../domain/prompt-builder.js';
import type { SecretStore } from '../ports/secret-store.js';
import type { SessionEventBus } from './event-bus.js';
import type { ActiveRun, GenerationCoordinator } from './generation-coordinator.js';
import type { GenerationRunner } from './generation-runner.js';
import type { LibraryService } from './library-service.js';
import type { SessionStore } from './session-store.js';

export interface SessionServiceOptions {
  sessions: SessionStore;
  library: LibraryService;
  secrets: SecretStore;
  events: SessionEventBus;
  coordinator: GenerationCoordinator;
  runner: GenerationRunner;
  logger: Logger;
  now?: () => Date;
  idFactory?: () => string;
}

export class SessionService {
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly options: SessionServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async initialize(): Promise<void> {
    await this.options.sessions.initialize();
    await this.options.sessions.pruneDrafts(this.now(), SESSION_DRAFT_TTL_DAYS);
    await this.recoverInterrupted();
  }

  async create(request: CreateSessionRequest): Promise<SessionData> {
    const subject = await this.options.library.getSubject(request.subjectId);
    const priorCourses = subject.courses.slice(0, PRIOR_COURSE_LIMIT).map((course) => ({
      topic: course.topic,
      audience: course.audience,
    }));
    const instructions = normalizedInstructions(request.instructions);
    const startingPrompt = buildStartingPrompt({
      subjectName: subject.name,
      topic: request.topic,
      audience: request.audience,
      ...(instructions === undefined ? {} : { instructions }),
      priorCourses,
    });
    const timestamp = this.now().toISOString();
    const session: SessionData = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: this.idFactory(),
      status: 'draft',
      subject: { id: subject.id, name: subject.name },
      input: {
        topic: request.topic,
        audience: request.audience,
        ...(instructions === undefined ? {} : { instructions }),
      },
      priorCourses,
      startingPrompt,
      continuations: [],
      sections: [],
      courseId: this.idFactory(),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.options.sessions.create(session);
  }

  async get(id: string): Promise<SessionData> {
    return this.options.sessions.require(id);
  }

  async listActive(): Promise<SessionSummary[]> {
    const sessions = await this.options.sessions.list();
    return sessions.filter(isInProgressSession).map(toSessionSummary);
  }

  async updateInputs(id: string, request: UpdateSessionInputsRequest): Promise<SessionData> {
    const subject = await this.options.library.getSubject(request.subjectId);
    const priorCourses = subject.courses.slice(0, PRIOR_COURSE_LIMIT).map((course) => ({
      topic: course.topic,
      audience: course.audience,
    }));
    const instructions = normalizedInstructions(request.instructions);
    const startingPrompt = buildStartingPrompt({
      subjectName: subject.name,
      topic: request.topic,
      audience: request.audience,
      ...(instructions === undefined ? {} : { instructions }),
      priorCourses,
    });

    return this.options.sessions.update(id, (session) => {
      if (!canEditInputs(session)) {
        throw this.invalidState(session, 'edit inputs');
      }

      const resetFromReview = session.status === 'outline_review';
      const updated: SessionData = {
        ...session,
        status: 'draft',
        stage: undefined,
        subject: { id: subject.id, name: subject.name },
        input: {
          topic: request.topic,
          audience: request.audience,
          ...(instructions === undefined ? {} : { instructions }),
        },
        priorCourses,
        startingPrompt,
        outlineRaw: undefined,
        outline: undefined,
        continuations: [],
        sections: resetFromReview ? [] : session.sections,
        usage: resetFromReview
          ? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
          : session.usage,
        activeSectionNumber: undefined,
        lastError: undefined,
        pauseReason: undefined,
        startedAt: undefined,
        completedAt: undefined,
        savedPath: undefined,
        updatedAt: this.now().toISOString(),
      };

      return updated;
    });
  }

  async startOutline(id: string): Promise<SessionSummary> {
    return this.beginOutline(id, 'start');
  }

  async regenerateOutline(id: string): Promise<SessionSummary> {
    return this.beginOutline(id, 'regenerate');
  }

  async approve(id: string): Promise<SessionSummary> {
    return this.beginRun(
      id,
      async (session) => {
        if (!canApproveOutline(session)) {
          throw this.invalidState(session, 'approve the outline');
        }

        await this.ensureSubjectAndKey(session);

        return {
          ...session,
          status: 'expanding',
          stage: 'sections',
          sections: session.sections.map((section) => ({
            ...section,
            status: 'pending',
            markdown: undefined,
            error: undefined,
            startedAt: undefined,
            completedAt: undefined,
          })),
          activeSectionNumber: undefined,
          lastError: undefined,
          pauseReason: undefined,
          startedAt: session.startedAt ?? this.now().toISOString(),
          updatedAt: this.now().toISOString(),
        };
      },
      (run) => this.options.runner.runExpansion(id, run.runId),
    );
  }

  async resume(id: string): Promise<SessionSummary> {
    let action: ReturnType<typeof resumeAction> = null;

    return this.beginRun(
      id,
      async (session) => {
        if (!canResume(session)) {
          throw this.invalidState(session, 'resume');
        }

        action = resumeAction(session);

        if (action === null) {
          throw this.invalidState(session, 'resume');
        }

        if (action !== 'finalization') {
          await this.ensureSubjectAndKey(session);
        }

        if (action === 'outline') {
          return {
            ...session,
            status: 'generating_outline',
            stage: 'outline',
            outlineRaw: undefined,
            outline: undefined,
            continuations: [],
            sections: [],
            activeSectionNumber: undefined,
            lastError: undefined,
            pauseReason: undefined,
            completedAt: undefined,
            savedPath: undefined,
            updatedAt: this.now().toISOString(),
          };
        }

        return {
          ...session,
          status: 'expanding',
          stage: action,
          sections: session.sections.map((section) =>
            section.status === 'running'
              ? { ...section, status: 'pending', markdown: undefined, startedAt: undefined }
              : section,
          ),
          activeSectionNumber: undefined,
          lastError: undefined,
          pauseReason: undefined,
          updatedAt: this.now().toISOString(),
        };
      },
      (run) => {
        if (action === 'outline') {
          return this.options.runner.runOutline(id, run.runId);
        }

        return action === 'finalization'
          ? this.options.runner.finalizeOnly(id, run.runId)
          : this.options.runner.runExpansion(id, run.runId);
      },
    );
  }

  async pause(id: string): Promise<SessionSummary> {
    const session = await this.options.sessions.require(id);

    if (!canPause(session)) {
      throw this.invalidState(session, 'pause');
    }

    if (!this.options.coordinator.requestPause(id)) {
      throw this.invalidState(session, 'pause');
    }

    return toSessionSummary(session);
  }

  async stop(id: string): Promise<SessionSummary> {
    const session = await this.options.sessions.require(id);

    if (!canStop(session)) {
      throw this.invalidState(session, 'stop');
    }

    if (!this.options.coordinator.abort(id, 'stop')) {
      throw this.invalidState(session, 'stop');
    }

    return toSessionSummary(session);
  }

  async delete(id: string): Promise<string> {
    const session = await this.options.sessions.require(id);

    if (isActiveSession(session)) {
      this.options.coordinator.cancelForDelete(id);
    }

    this.options.events.close(id);
    await this.options.sessions.delete(id);
    return session.id;
  }

  async recoverInterrupted(): Promise<void> {
    const sessions = await this.options.sessions.list();

    for (const session of sessions) {
      if (!isActiveSession(session)) continue;

      try {
        await this.options.sessions.update(session.id, (current) => ({
          ...current,
          status: 'paused',
          pauseReason: 'interrupted',
          activeSectionNumber: undefined,
          updatedAt: this.now().toISOString(),
          sections: current.sections.map((section) =>
            section.status === 'running'
              ? { ...section, status: 'pending', markdown: undefined, startedAt: undefined }
              : section,
          ),
        }));
      } catch (error) {
        this.options.logger.warn(
          { err: error, sessionId: session.id },
          'An interrupted session could not be marked as paused.',
        );
      }
    }
  }

  async shutdown(): Promise<void> {
    this.options.coordinator.abortAll();
  }

  private async beginOutline(id: string, mode: 'start' | 'regenerate'): Promise<SessionSummary> {
    return this.beginRun(
      id,
      async (session) => {
        if (mode === 'start') {
          if (!canStartOutline(session)) {
            throw this.invalidState(session, 'generate the outline');
          }
        } else {
          if (expansionStarted(session)) {
            throw new SessionError(
              'EXPANSION_STARTED',
              'Section expansion has already started. Resume or discard this session instead.',
              { details: { status: session.status, stage: session.stage ?? null } },
            );
          }

          if (!canRegenerateOutline(session)) {
            throw this.invalidState(session, 'regenerate the outline');
          }
        }

        await this.ensureSubjectAndKey(session);

        return {
          ...session,
          status: 'generating_outline',
          stage: 'outline',
          outlineRaw: undefined,
          outline: undefined,
          continuations: [],
          sections: [],
          activeSectionNumber: undefined,
          lastError: undefined,
          pauseReason: undefined,
          completedAt: undefined,
          savedPath: undefined,
          startedAt: session.startedAt ?? this.now().toISOString(),
          updatedAt: this.now().toISOString(),
        };
      },
      (run) => this.options.runner.runOutline(id, run.runId),
    );
  }

  private async beginRun(
    id: string,
    prepare: (session: SessionData) => Promise<SessionData>,
    launch: (run: ActiveRun, session: SessionData) => Promise<void>,
  ): Promise<SessionSummary> {
    let run: ActiveRun | null = null;
    let prepared: SessionData | null = null;

    try {
      const updated = await this.options.sessions.update(id, async (session) => {
        const next = await prepare(session);
        run = this.options.coordinator.tryBegin(id);

        if (run === null) {
          throw new SessionError(
            'GENERATION_BUSY',
            'Another course is being generated. Finish or pause it before starting this one.',
            {
              details: { activeSessionId: this.options.coordinator.getActiveSessionId() },
            },
          );
        }

        prepared = next;
        return next;
      });

      const activeRun = run as ActiveRun | null;
      const activeSession = prepared as SessionData | null;

      if (activeRun === null || activeSession === null) {
        throw new SessionError('INTERNAL_ERROR', 'The generation run could not be started.');
      }

      this.publishStatus(updated);
      this.schedule(launch(activeRun, activeSession));
      return toSessionSummary(updated);
    } catch (error) {
      const activeRun = run as ActiveRun | null;
      if (activeRun !== null) {
        this.options.coordinator.finish(id, activeRun.runId);
      }
      throw error;
    }
  }

  private schedule(work: Promise<void>): void {
    void work.catch((error: unknown) => {
      this.options.logger.error({ err: error }, 'A generation run ended unexpectedly.');
    });
  }

  private async ensureSubjectAndKey(session: SessionData): Promise<void> {
    await this.options.library.getSubject(session.subject.id);
    const key = await this.options.secrets.resolve();

    if (key === null) {
      throw new SessionError(
        'KEY_MISSING',
        'No DeepSeek API key is configured. Run npm run key:set, then try again.',
      );
    }
  }

  private invalidState(session: SessionData, action: string): SessionError {
    return new SessionError(
      'INVALID_STATE',
      `Cannot ${action} while the session is ${session.status}.`,
      {
        details: { action, status: session.status, stage: session.stage ?? null },
      },
    );
  }

  private publishStatus(session: SessionData): void {
    this.options.events.publish({
      type: 'status',
      sessionId: session.id,
      at: this.now().toISOString(),
      session: toSessionSummary(session),
    });
  }
}

function normalizedInstructions(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
