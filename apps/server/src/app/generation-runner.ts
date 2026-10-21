import type { Logger } from 'pino';
import type {
  SessionData,
  SessionError as SessionErrorData,
  SessionSection,
  SessionTokenUsage,
} from '@ccb/contracts';

import { AiProviderError } from '../domain/ai-errors.js';
import { assembleCourse, normalizeSectionContent } from '../domain/course-assembler.js';
import { CourseAssemblyError } from '../domain/course.js';
import { LibraryError } from '../domain/library-errors.js';
import { OutlineError } from '../domain/outline-errors.js';
import { parseOutline } from '../domain/outline-parser.js';
import {
  buildContinuationPrompts,
  type ContinuationPromptInput,
} from '../domain/prompt-builder.js';
import { SessionError } from '../domain/session-errors.js';
import { toSessionSummary } from '../domain/session-state.js';
import type { AiChunk, AiProvider, AiUsage } from '../ports/ai-provider.js';
import type { LibraryService } from './library-service.js';
import type { SessionEventBus } from './event-bus.js';
import type { GenerationCoordinator } from './generation-coordinator.js';
import type { SessionStore } from './session-store.js';

export interface GenerationRunnerOptions {
  sessions: SessionStore;
  library: LibraryService;
  provider: AiProvider;
  coordinator: GenerationCoordinator;
  events: SessionEventBus;
  logger: Logger;
  model: string;
  now?: () => Date;
}

export class GenerationRunner {
  private readonly now: () => Date;

  constructor(private readonly options: GenerationRunnerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async runOutline(sessionId: string, runId: string): Promise<void> {
    try {
      const session = await this.options.sessions.get(sessionId);

      if (session === null || !this.options.coordinator.isCurrent(sessionId, runId)) {
        await this.handleAbortedRun(sessionId, runId);
        return;
      }

      const signal = this.options.coordinator.getSignal(sessionId, runId);
      if (signal === null) return;

      let raw = '';
      let usage: SessionTokenUsage | undefined;

      try {
        for await (const chunk of this.options.provider.streamOutline(
          {
            prompt: {
              system: session.startingPrompt.system,
              user: session.startingPrompt.user,
            },
          },
          signal,
        )) {
          if (!this.options.coordinator.isCurrent(sessionId, runId)) {
            throw new AiProviderError('AI_ABORTED', 'The AI request was cancelled.');
          }

          raw += chunk.text;
          usage = addChunkUsage(usage, chunk);
          this.publishOutlineDelta(sessionId, chunk);
        }
      } catch (error) {
        await this.failOrPause(sessionId, runId, 'outline', error, undefined);
        return;
      }

      if (this.options.coordinator.shouldPause(sessionId, runId)) {
        await this.pauseSession(sessionId, 'outline', 'user');
        return;
      }

      if (!this.options.coordinator.isCurrent(sessionId, runId)) {
        await this.handleAbortedRun(sessionId, runId);
        return;
      }

      await this.options.sessions.update(sessionId, (current) => ({
        ...current,
        outlineRaw: raw,
        usage: mergeUsage(current.usage, usage),
        updatedAt: this.now().toISOString(),
      }));

      let parsed;

      try {
        parsed = parseOutline(raw, {
          fallbackTitle: session.input.topic,
          fallbackAudience: session.input.audience,
        });
      } catch (error) {
        await this.markFailed(sessionId, 'outline', error);
        return;
      }

      const promptInput: ContinuationPromptInput = {
        outline: parsed,
        audience: session.input.audience,
        ...(session.input.instructions === undefined
          ? {}
          : { instructions: session.input.instructions }),
      };
      const continuations = buildContinuationPrompts(promptInput);
      const sections: SessionSection[] = parsed.sections.map((section) => {
        const prompt = continuations.find((entry) => entry.sectionNumber === section.number);

        if (prompt === undefined) {
          throw new SessionError(
            'INTERNAL_ERROR',
            'A continuation prompt could not be matched to its outline section.',
          );
        }

        return {
          number: section.number,
          title: section.title,
          bullets: section.bullets,
          wordBudget: prompt.wordBudget,
          prompt,
          status: 'pending',
        };
      });

      const updated = await this.options.sessions.update(sessionId, (current) => ({
        ...current,
        status: 'outline_review',
        stage: undefined,
        outline: parsed,
        continuations,
        sections,
        usage: mergeUsage(current.usage, usage),
        activeSectionNumber: undefined,
        lastError: undefined,
        pauseReason: undefined,
        updatedAt: this.now().toISOString(),
      }));

      this.options.events.publish({
        type: 'outline_ready',
        sessionId,
        at: this.now().toISOString(),
        outline: parsed,
        continuations,
      });
      this.publishStatus(updated);
    } finally {
      this.options.coordinator.finish(sessionId, runId);
    }
  }

  async runExpansion(sessionId: string, runId: string): Promise<void> {
    try {
      while (true) {
        if (!this.options.coordinator.isCurrent(sessionId, runId)) {
          await this.handleAbortedRun(sessionId, runId);
          return;
        }

        if (this.options.coordinator.shouldPause(sessionId, runId)) {
          await this.pauseSession(sessionId, 'sections', 'user');
          return;
        }

        const session = await this.options.sessions.get(sessionId);

        if (session === null) return;

        const nextSection = session.sections.find(
          (section) => section.status === 'pending' || section.status === 'failed',
        );

        if (nextSection === undefined) {
          await this.finalizeCourse(sessionId, runId);
          return;
        }

        const completed = await this.generateSection(sessionId, runId, nextSection);

        if (!completed) {
          return;
        }

        if (this.options.coordinator.shouldPause(sessionId, runId)) {
          await this.pauseSession(sessionId, 'sections', 'user');
          return;
        }
      }
    } finally {
      this.options.coordinator.finish(sessionId, runId);
    }
  }

  async finalizeOnly(sessionId: string, runId: string): Promise<void> {
    try {
      await this.finalizeCourse(sessionId, runId);
    } finally {
      this.options.coordinator.finish(sessionId, runId);
    }
  }

  private async generateSection(
    sessionId: string,
    runId: string,
    section: SessionSection,
  ): Promise<boolean> {
    const started = await this.options.sessions.update(sessionId, (current) => ({
      ...current,
      status: 'expanding',
      stage: 'sections',
      activeSectionNumber: section.number,
      updatedAt: this.now().toISOString(),
      sections: current.sections.map((entry) =>
        entry.number === section.number
          ? {
              ...entry,
              status: 'running',
              startedAt: this.now().toISOString(),
              markdown: undefined,
              error: undefined,
            }
          : entry,
      ),
    }));

    this.options.events.publish({
      type: 'section_started',
      sessionId,
      at: this.now().toISOString(),
      sectionNumber: section.number,
      title: section.title,
    });
    this.publishStatus(started);

    const signal = this.options.coordinator.getSignal(sessionId, runId);
    if (signal === null) return false;

    let markdown = '';
    let usage: SessionTokenUsage | undefined;

    try {
      for await (const chunk of this.options.provider.streamSection(
        {
          prompt: { system: section.prompt.system, user: section.prompt.user },
          sectionNumber: section.number,
          sectionTitle: section.title,
        },
        signal,
      )) {
        if (!this.options.coordinator.isCurrent(sessionId, runId)) {
          throw new AiProviderError('AI_ABORTED', 'The AI request was cancelled.');
        }

        markdown += chunk.text;
        usage = addChunkUsage(usage, chunk);
        this.options.events.publish({
          type: 'section_delta',
          sessionId,
          at: this.now().toISOString(),
          sectionNumber: section.number,
          text: chunk.text,
        });
      }

      normalizeSectionContent(section.number, section.title, markdown);
    } catch (error) {
      await this.failOrPause(sessionId, runId, 'sections', error, section.number);
      return false;
    }

    const completed = await this.options.sessions.update(sessionId, (current) => ({
      ...current,
      sections: current.sections.map((entry) =>
        entry.number === section.number
          ? {
              ...entry,
              status: 'completed',
              markdown,
              completedAt: this.now().toISOString(),
              usage: usage ?? entry.usage,
              error: undefined,
            }
          : entry,
      ),
      usage: mergeUsage(current.usage, usage),
      activeSectionNumber: undefined,
      updatedAt: this.now().toISOString(),
    }));

    this.options.events.publish({
      type: 'section_completed',
      sessionId,
      at: this.now().toISOString(),
      sectionNumber: section.number,
      markdown,
      ...(usage === undefined ? {} : { usage }),
    });
    this.publishStatus(completed);
    return true;
  }

  private async finalizeCourse(sessionId: string, runId: string): Promise<void> {
    if (!this.options.coordinator.isCurrent(sessionId, runId)) {
      await this.handleAbortedRun(sessionId, runId);
      return;
    }

    const session = await this.options.sessions.get(sessionId);

    if (session === null) return;

    if (session.sections.some((section) => section.status !== 'completed')) {
      await this.markFailed(
        sessionId,
        'sections',
        new SessionError(
          'INTERNAL_ERROR',
          'Saving was attempted before every section was complete.',
        ),
      );
      return;
    }

    const saving = await this.options.sessions.update(sessionId, (current) => ({
      ...current,
      status: 'expanding',
      stage: 'finalization',
      activeSectionNumber: undefined,
      updatedAt: this.now().toISOString(),
    }));
    this.publishStatus(saving);

    try {
      const subject = await this.options.library.getSubject(session.subject.id);
      const outline = session.outline;

      if (outline === undefined) {
        throw new SessionError('INVALID_STATE', 'The approved outline is missing.');
      }

      const drafts = session.sections.map((section) => ({
        number: section.number,
        title: section.title,
        markdown: section.markdown ?? '',
      }));
      const assembled = assembleCourse({
        outline,
        sections: drafts,
        identity: {
          id: session.courseId,
          subject: { id: subject.id, name: subject.name },
          topic: session.input.topic,
          audience: session.input.audience,
          ...(session.input.instructions === undefined
            ? {}
            : { instructions: session.input.instructions }),
          createdAt: session.createdAt,
          updatedAt: this.now().toISOString(),
          ai: { provider: 'deepseek', model: this.options.model },
        },
      });
      const result = await this.options.library.finalizeCourse({
        courseId: session.courseId,
        subjectId: subject.id,
        folderName: session.input.topic,
        metadata: assembled.metadata,
        courseMarkdown: assembled.courseMarkdown,
        outlineMarkdown: assembled.outlineMarkdown,
      });
      const updated = await this.options.sessions.update(sessionId, (current) => ({
        ...current,
        status: 'completed',
        stage: undefined,
        activeSectionNumber: undefined,
        completedAt: this.now().toISOString(),
        savedPath: result.relativePath,
        lastError: undefined,
        pauseReason: undefined,
        updatedAt: this.now().toISOString(),
      }));

      this.options.events.publish({
        type: 'completed',
        sessionId,
        at: this.now().toISOString(),
        courseId: session.courseId,
        savedPath: result.relativePath,
        stats: assembled.stats,
      });
      this.publishStatus(updated);
    } catch (error) {
      await this.markFailed(sessionId, 'finalization', error);
    }
  }

  private async failOrPause(
    sessionId: string,
    runId: string,
    stage: 'outline' | 'sections',
    error: unknown,
    sectionNumber: number | undefined,
  ): Promise<void> {
    const abortReason = this.options.coordinator.getAbortReason(sessionId, runId);

    if (abortReason !== null && abortReason !== 'delete') {
      await this.pauseSession(
        sessionId,
        stage,
        abortReason === 'interrupted' ? 'interrupted' : 'stop',
        sectionNumber,
      );
      return;
    }

    if (abortReason === 'delete') {
      return;
    }

    if (error instanceof AiProviderError && error.code === 'AI_ABORTED') {
      await this.pauseSession(sessionId, stage, 'stop', sectionNumber);
      return;
    }

    if (stage === 'sections' && sectionNumber !== undefined) {
      const sessionError = toSessionError(error, this.now());
      const failed = await this.options.sessions
        .update(sessionId, (current) => ({
          ...current,
          status: 'failed',
          stage: 'sections',
          activeSectionNumber: undefined,
          lastError: sessionError,
          updatedAt: this.now().toISOString(),
          sections: current.sections.map((entry) =>
            entry.number === sectionNumber
              ? { ...entry, status: 'failed', error: sessionError, markdown: undefined }
              : entry,
          ),
        }))
        .catch(() => null);

      if (failed !== null) {
        this.options.events.publish({
          type: 'section_failed',
          sessionId,
          at: this.now().toISOString(),
          sectionNumber,
          error: sessionError,
        });
        this.publishStatus(failed);
      }
      return;
    }

    await this.markFailed(sessionId, stage, error);
  }

  private async handleAbortedRun(sessionId: string, runId: string): Promise<void> {
    const reason = this.options.coordinator.getAbortReason(sessionId, runId);

    if (reason === null || reason === 'delete') {
      return;
    }

    const current = await this.options.sessions.get(sessionId).catch(() => null);

    if (current === null) return;

    await this.pauseSession(
      sessionId,
      current.stage ?? 'sections',
      reason === 'interrupted' ? 'interrupted' : 'stop',
    );
  }

  private async pauseSession(
    sessionId: string,
    stage: 'outline' | 'sections' | 'finalization',
    reason: 'user' | 'stop' | 'interrupted',
    sectionNumber?: number,
  ): Promise<void> {
    const updated = await this.options.sessions
      .update(sessionId, (current) => ({
        ...current,
        status: 'paused',
        stage,
        pauseReason: reason,
        activeSectionNumber: undefined,
        lastError: undefined,
        updatedAt: this.now().toISOString(),
        sections: current.sections.map((entry) => {
          if (entry.status !== 'running') return entry;
          if (sectionNumber !== undefined && entry.number !== sectionNumber) return entry;
          return { ...entry, status: 'pending', markdown: undefined, startedAt: undefined };
        }),
      }))
      .catch(() => null);

    if (updated !== null) {
      this.publishStatus(updated);
    }
  }

  private async markFailed(
    sessionId: string,
    stage: 'outline' | 'sections' | 'finalization',
    error: unknown,
  ): Promise<void> {
    const sessionError = toSessionError(error, this.now());
    const updated = await this.options.sessions
      .update(sessionId, (current) => ({
        ...current,
        status: 'failed',
        stage,
        pauseReason: undefined,
        activeSectionNumber: undefined,
        lastError: sessionError,
        updatedAt: this.now().toISOString(),
        sections: current.sections.map((entry) =>
          entry.status === 'running' ? { ...entry, status: 'pending', markdown: undefined } : entry,
        ),
      }))
      .catch(() => null);

    if (updated !== null) {
      this.publishStatus(updated);
    }
  }

  private publishOutlineDelta(sessionId: string, chunk: AiChunk): void {
    if (chunk.text.length === 0) return;

    this.options.events.publish({
      type: 'outline_delta',
      sessionId,
      at: this.now().toISOString(),
      text: chunk.text,
    });
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

function addChunkUsage(
  total: SessionTokenUsage | undefined,
  chunk: AiChunk,
): SessionTokenUsage | undefined {
  if (chunk.usage === undefined) return total;
  return mergeUsage(total ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, chunk.usage);
}

function mergeUsage(
  left: SessionTokenUsage,
  right: SessionTokenUsage | AiUsage | undefined,
): SessionTokenUsage {
  if (right === undefined) return left;

  const promptTokens = left.promptTokens + (right.promptTokens ?? 0);
  const completionTokens = left.completionTokens + (right.completionTokens ?? 0);

  return {
    promptTokens,
    completionTokens,
    totalTokens: left.totalTokens + (right.totalTokens ?? promptTokens + completionTokens),
  };
}

function toSessionError(error: unknown, now: Date): SessionErrorData {
  const at = now.toISOString();

  if (error instanceof AiProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details,
      at,
    };
  }

  if (error instanceof OutlineError) {
    return {
      code: 'OUTLINE_INVALID',
      message: error.message,
      retryable: false,
      details: { issues: error.issues },
      at,
    };
  }

  if (error instanceof CourseAssemblyError) {
    return {
      code: 'AI_UPSTREAM',
      message: error.message,
      retryable: false,
      details: {
        ...(error.sectionNumber === undefined ? {} : { sectionNumber: error.sectionNumber }),
      },
      at,
    };
  }

  if (error instanceof SessionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details,
      at,
    };
  }

  if (error instanceof LibraryError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      details: error.details,
      at,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'An unexpected session error occurred.',
    retryable: false,
    details: {},
    at,
  };
}
