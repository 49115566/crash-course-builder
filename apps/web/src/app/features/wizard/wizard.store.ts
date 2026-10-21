import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type {
  CourseStats,
  SessionData,
  SessionEvent,
  SessionSection,
  SessionSummary,
  UpdateSessionInputsRequest,
} from '@ccb/contracts';
import { firstValueFrom } from 'rxjs';

import type { ApiClientError } from '../../core/api/api-error';
import { SessionApiService } from '../../core/api/session-api.service';
import { DeltaBuffer, type DeltaFlush } from '../../core/realtime/delta-buffer';
import {
  EVENT_SOURCE_FACTORY,
  SessionEventStream,
  type SessionConnectionState,
} from '../../core/realtime/session-event-stream';
import {
  canRegenerateOutline,
  expansionStarted,
  sessionStatusLabel,
  sessionStatusTone,
  type StatusTone,
} from '../../core/sessions/session-routing';
import { countWords } from '../../core/text/word-count';
import { ToastService } from '../../shared/ui/toast/toast.service';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const EMPTY_LIVE: Record<number, string> = {};

@Injectable()
export class SessionWizardStore {
  private readonly api = inject(SessionApiService);
  private readonly toast = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly router = inject(Router);
  private readonly eventSourceFactory = inject(EVENT_SOURCE_FACTORY);

  private readonly sessionState = signal<SessionData | null>(null);
  private readonly loadStatusState = signal<LoadStatus>('idle');
  private readonly loadErrorState = signal<ApiClientError | null>(null);
  private readonly actionState = signal<string | null>(null);
  private readonly actionErrorState = signal<ApiClientError | null>(null);
  private readonly pauseRequestedState = signal(false);
  private readonly connectionState = signal<SessionConnectionState>('closed');
  private readonly liveOutlineState = signal('');
  private readonly liveSectionsState = signal<Record<number, string>>(EMPTY_LIVE);
  private readonly completionStatsState = signal<CourseStats | null>(null);

  private stream: SessionEventStream | null = null;
  private loadToken = 0;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly buffer = new DeltaBuffer((flush) => this.applyDelta(flush));
  private loadedId: string | null = null;

  readonly session = this.sessionState.asReadonly();
  readonly loadStatus = this.loadStatusState.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  readonly action = this.actionState.asReadonly();
  readonly actionError = this.actionErrorState.asReadonly();
  readonly pauseRequested = this.pauseRequestedState.asReadonly();
  readonly connection = this.connectionState.asReadonly();
  readonly liveOutline = this.liveOutlineState.asReadonly();
  readonly liveSections = this.liveSectionsState.asReadonly();
  readonly completionStats = this.completionStatsState.asReadonly();

  readonly sections = computed<SessionSection[]>(() => this.sessionState()?.sections ?? []);
  readonly totalSections = computed(() => this.sections().length);
  readonly completedSections = computed(
    () => this.sections().filter((section) => section.status === 'completed').length,
  );
  readonly activeSectionNumber = computed(() => this.sessionState()?.activeSectionNumber ?? null);
  readonly activeSection = computed(() => {
    const number = this.activeSectionNumber();
    return number === null
      ? null
      : (this.sections().find((section) => section.number === number) ?? null);
  });
  readonly isGenerating = computed(() => {
    const status = this.sessionState()?.status;
    return status === 'generating_outline' || status === 'expanding';
  });
  readonly isPaused = computed(() => this.sessionState()?.status === 'paused');
  readonly needsAttention = computed(() => this.sessionState()?.status === 'failed');
  readonly isComplete = computed(() => this.sessionState()?.status === 'completed');
  readonly canApprove = computed(() => this.sessionState()?.status === 'outline_review');
  readonly canPause = computed(() => this.isGenerating());
  readonly canStop = computed(() => this.isGenerating());
  readonly canResume = computed(() => {
    const status = this.sessionState()?.status;
    return status === 'paused' || status === 'failed';
  });
  readonly canEditInputs = computed(() => {
    const status = this.sessionState()?.status;
    return status === 'draft' || status === 'outline_review';
  });
  readonly canRegenerate = computed(() => {
    const session = this.sessionState();
    return session !== null && canRegenerateOutline(session) && !expansionStarted(session);
  });
  readonly writingStarted = computed(() => {
    const session = this.sessionState();
    return session !== null && expansionStarted(session);
  });
  readonly statusLabel = computed(() => {
    const session = this.sessionState();
    return session === null ? 'Loading' : sessionStatusLabel(session);
  });
  readonly statusTone = computed<StatusTone>(() => {
    const session = this.sessionState();
    return session === null ? 'neutral' : sessionStatusTone(session);
  });
  readonly currentLiveText = computed(() => {
    const number = this.activeSectionNumber();
    return number === null ? '' : (this.liveSectionsState()[number] ?? '');
  });
  readonly currentLiveWords = computed(() => countWords(this.currentLiveText()));
  readonly totalWords = computed(() => {
    const completed = this.sections()
      .filter((section) => section.status === 'completed')
      .reduce((total, section) => total + countWords(section.markdown ?? ''), 0);
    return completed + this.currentLiveWords();
  });
  readonly progressPercent = computed(() => {
    const total = this.totalSections();
    if (total === 0) return 0;

    const completed = this.completedSections();
    const active = this.activeSection();
    const liveWords = this.currentLiveWords();
    const partial =
      active === null || active.status === 'completed' || active.wordBudget <= 0
        ? 0
        : Math.min(0.95, liveWords / active.wordBudget);

    return Math.min(100, Math.round(((completed + partial) / total) * 100));
  });
  readonly savedPath = computed(() => this.sessionState()?.savedPath ?? null);
  readonly lastError = computed(() => this.sessionState()?.lastError ?? null);

  async ensureLoaded(sessionId: string): Promise<boolean> {
    if (this.loadedId === sessionId && this.sessionState() !== null) {
      this.ensureStream();
      return true;
    }

    return this.load(sessionId);
  }

  async load(
    sessionId: string,
    options: { silent?: boolean; preserveLive?: boolean } = {},
  ): Promise<boolean> {
    const token = ++this.loadToken;
    const changingSession = this.loadedId !== null && this.loadedId !== sessionId;

    if (changingSession) {
      this.closeStream();
      this.buffer.reset();
      this.loadedId = null;
      this.sessionState.set(null);
      this.liveOutlineState.set('');
      this.liveSectionsState.set(EMPTY_LIVE);
      this.completionStatsState.set(null);
      this.pauseRequestedState.set(false);
      this.actionErrorState.set(null);
    }

    if (!options.silent) {
      this.loadStatusState.set('loading');
      this.loadErrorState.set(null);
    }

    try {
      const response = await firstValueFrom(this.api.get(sessionId));
      if (token !== this.loadToken) return false;

      this.loadedId = sessionId;
      this.applySession(response.session, options.preserveLive === true);
      this.loadStatusState.set('ready');
      this.loadErrorState.set(null);
      this.ensureStream(changingSession);
      return true;
    } catch (error) {
      if (token !== this.loadToken) return false;
      const clientError = asClientError(error);

      if (clientError.code === 'NOT_FOUND') {
        this.closeStream();
        this.loadedId = null;
        this.sessionState.set(null);
        this.loadStatusState.set('error');
        this.loadErrorState.set(clientError);
        this.toast.error('That session could not be found. It may have been discarded.');
        await this.router.navigate(['/']);
        return false;
      }

      this.loadStatusState.set(this.loadStatusState() === 'ready' ? 'ready' : 'error');
      this.loadErrorState.set(clientError);
      return false;
    }
  }

  async retryLoad(): Promise<boolean> {
    const id = this.sessionState()?.id ?? this.loadedId;
    return id === null ? false : this.load(id);
  }

  async startOutline(): Promise<boolean> {
    return this.runAction('start-outline', async (session) => {
      await firstValueFrom(this.api.startOutline(session.id));
      await this.reconcileNow();
      this.ensureStream(true);
    });
  }

  async regenerateOutline(): Promise<boolean> {
    return this.runAction('regenerate-outline', async (session) => {
      await firstValueFrom(this.api.regenerateOutline(session.id));
      this.liveOutlineState.set('');
      this.buffer.reset();
      await this.reconcileNow();
      this.ensureStream(true);
    });
  }

  async approve(): Promise<boolean> {
    return this.runAction('approve', async (session) => {
      await firstValueFrom(this.api.approve(session.id));
      await this.reconcileNow();
      this.ensureStream(true);
    });
  }

  async pause(): Promise<boolean> {
    return this.runAction('pause', async (session) => {
      await firstValueFrom(this.api.pause(session.id));
      this.pauseRequestedState.set(true);
      this.toast.info('Pausing after the current section finishes.');
    });
  }

  async stop(): Promise<boolean> {
    return this.runAction('stop', async (session) => {
      await firstValueFrom(this.api.stop(session.id));
      this.pauseRequestedState.set(false);
      await this.reconcileNow();
    });
  }

  async resume(): Promise<boolean> {
    return this.runAction('resume', async (session) => {
      await firstValueFrom(this.api.resume(session.id));
      this.pauseRequestedState.set(false);
      await this.reconcileNow();
      this.ensureStream(true);
    });
  }

  async updateInputs(request: UpdateSessionInputsRequest): Promise<SessionData | null> {
    const session = this.sessionState();
    if (session === null || this.actionState() !== null) return null;

    this.actionState.set('update-inputs');
    this.actionErrorState.set(null);

    try {
      const response = await firstValueFrom(this.api.updateInputs(session.id, request));
      this.applySession(response.session, false);
      return response.session;
    } catch (error) {
      this.actionErrorState.set(asClientError(error));
      return null;
    } finally {
      this.actionState.set(null);
    }
  }

  async discard(): Promise<boolean> {
    const session = this.sessionState();
    if (session === null || this.actionState() !== null) return false;

    this.actionState.set('discard');
    this.actionErrorState.set(null);

    try {
      await firstValueFrom(this.api.delete(session.id));
      this.reset();
      this.toast.success('Session discarded.');
      return true;
    } catch (error) {
      const clientError = asClientError(error);
      this.actionErrorState.set(clientError);
      this.toast.error(clientError.message);
      return false;
    } finally {
      this.actionState.set(null);
    }
  }

  clearActionError(): void {
    this.actionErrorState.set(null);
  }

  reset(): void {
    this.dispose();
    this.loadToken += 1;
    this.loadedId = null;
    this.sessionState.set(null);
    this.loadStatusState.set('idle');
    this.loadErrorState.set(null);
    this.actionState.set(null);
    this.actionErrorState.set(null);
    this.pauseRequestedState.set(false);
    this.connectionState.set('closed');
    this.liveOutlineState.set('');
    this.liveSectionsState.set(EMPTY_LIVE);
    this.completionStatsState.set(null);
  }

  reconnect(): void {
    this.ensureStream(true);
  }

  dispose(): void {
    this.closeStream();
    this.buffer.reset();
    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  private async runAction(
    name: string,
    work: (session: SessionData) => Promise<void>,
  ): Promise<boolean> {
    const session = this.sessionState();
    if (session === null || this.actionState() !== null) return false;

    this.actionState.set(name);
    this.actionErrorState.set(null);

    try {
      await work(session);
      return true;
    } catch (error) {
      const clientError = asClientError(error);
      this.actionErrorState.set(clientError);

      if (
        clientError.code === 'INVALID_STATE' ||
        clientError.code === 'EXPANSION_STARTED' ||
        clientError.code === 'CONFLICT' ||
        clientError.code === 'NETWORK_ERROR'
      ) {
        await this.reconcileNow();
      }

      return false;
    } finally {
      this.actionState.set(null);
    }
  }

  private applySession(next: SessionData, preserveLive: boolean): void {
    const previous = this.sessionState();
    const keepLive = preserveLive && previous !== null && this.isSameActiveStage(previous, next);

    if (!keepLive) {
      this.buffer.reset();
      this.liveOutlineState.set('');
      this.liveSectionsState.set(EMPTY_LIVE);
    }

    if (next.status === 'completed' && this.completionStatsState() === null) {
      this.completionStatsState.set(computeStats(next));
    }

    this.sessionState.set(next);

    if (next.status === 'completed') {
      this.pauseRequestedState.set(false);
      this.closeStream();
    }
  }

  private isSameActiveStage(previous: SessionData, next: SessionData): boolean {
    if (previous.status === 'generating_outline' && next.status === 'generating_outline') {
      return true;
    }

    return (
      previous.status === 'expanding' &&
      next.status === 'expanding' &&
      previous.activeSectionNumber !== undefined &&
      previous.activeSectionNumber === next.activeSectionNumber
    );
  }

  private handleEvent(event: SessionEvent): void {
    switch (event.type) {
      case 'snapshot':
        this.buffer.reset();
        this.applySession(event.session, this.sessionState() !== null);
        this.loadStatusState.set('ready');
        break;
      case 'status':
        this.mergeSummary(event.session);
        this.scheduleReconcile();
        break;
      case 'outline_delta':
        this.buffer.appendOutline(event.text);
        break;
      case 'outline_ready':
        this.buffer.flush();
        this.liveOutlineState.set('');
        this.sessionState.update((session) =>
          session === null
            ? session
            : { ...session, outline: event.outline, continuations: event.continuations },
        );
        this.voidAnnounce('Outline ready for review.');
        this.scheduleReconcile();
        break;
      case 'section_started':
        this.updateSection(event.sectionNumber, (section) => ({
          ...section,
          status: 'running',
          markdown: undefined,
          error: undefined,
        }));
        this.sessionState.update((session) =>
          session === null || session.id !== event.sessionId
            ? session
            : { ...session, activeSectionNumber: event.sectionNumber, status: 'expanding' },
        );
        this.liveSectionsState.update((sections) => ({
          ...sections,
          [event.sectionNumber]: '',
        }));
        this.voidAnnounce(
          `Writing section ${String(event.sectionNumber)} of ${String(this.totalSections())}: ${event.title}.`,
        );
        this.scheduleReconcile();
        break;
      case 'section_delta':
        this.buffer.appendSection(event.sectionNumber, event.text);
        break;
      case 'section_completed':
        this.buffer.flush();
        this.updateSection(event.sectionNumber, (section) => ({
          ...section,
          status: 'completed',
          markdown: event.markdown,
          ...(event.usage === undefined ? {} : { usage: event.usage }),
        }));
        this.liveSectionsState.update((sections) => {
          const copy = { ...sections };
          delete copy[event.sectionNumber];
          return copy;
        });
        this.voidAnnounce(
          `Section ${String(event.sectionNumber)} complete. ${String(this.completedSections())} of ${String(this.totalSections())} sections done.`,
        );
        this.scheduleReconcile();
        break;
      case 'section_failed':
        this.buffer.flush();
        this.updateSection(event.sectionNumber, (section) => ({
          ...section,
          status: 'failed',
          markdown: undefined,
          error: event.error,
        }));
        this.sessionState.update((session) =>
          session === null
            ? session
            : {
                ...session,
                status: 'failed',
                stage: 'sections',
                activeSectionNumber: undefined,
                lastError: event.error,
              },
        );
        this.voidAnnounce('Writing paused. This course needs attention.');
        this.scheduleReconcile();
        break;
      case 'completed':
        this.buffer.flush();
        this.completionStatsState.set(event.stats);
        this.sessionState.update((session) =>
          session === null
            ? session
            : {
                ...session,
                status: 'completed',
                stage: undefined,
                activeSectionNumber: undefined,
                savedPath: event.savedPath,
                pauseReason: undefined,
                lastError: undefined,
              },
        );
        this.voidAnnounce('Course saved. Your crash course is ready.');
        this.scheduleReconcile();
        this.closeStream();
        break;
    }
  }

  private applyDelta(flush: DeltaFlush): void {
    if (flush.outline.length > 0) {
      this.liveOutlineState.update((text) => text + flush.outline);
    }

    if (flush.sections.size > 0) {
      this.liveSectionsState.update((sections) => {
        const next = { ...sections };
        for (const [number, text] of flush.sections) {
          next[number] = (next[number] ?? '') + text;
        }
        return next;
      });
    }
  }

  private updateSection(number: number, update: (section: SessionSection) => SessionSection): void {
    this.sessionState.update((session) =>
      session === null
        ? session
        : {
            ...session,
            sections: session.sections.map((section) =>
              section.number === number ? update(section) : section,
            ),
          },
    );
  }

  private mergeSummary(summary: SessionSummary): void {
    this.sessionState.update((session) => {
      if (session === null || session.id !== summary.id) return session;
      return {
        ...session,
        status: summary.status,
        ...(summary.stage === undefined ? { stage: undefined } : { stage: summary.stage }),
        ...(summary.activeSectionNumber === undefined
          ? { activeSectionNumber: undefined }
          : { activeSectionNumber: summary.activeSectionNumber }),
        ...(summary.pauseReason === undefined
          ? { pauseReason: undefined }
          : { pauseReason: summary.pauseReason }),
        ...(summary.lastError === undefined
          ? { lastError: undefined }
          : { lastError: summary.lastError }),
        ...(summary.savedPath === undefined
          ? { savedPath: undefined }
          : { savedPath: summary.savedPath }),
        updatedAt: summary.updatedAt,
      };
    });

    if (summary.status !== 'expanding' && summary.status !== 'generating_outline') {
      this.pauseRequestedState.set(false);
    }
  }

  private scheduleReconcile(): void {
    if (this.reconcileTimer !== null) return;
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      void this.reconcileNow();
    }, 100);
  }

  private async reconcileNow(): Promise<void> {
    const session = this.sessionState();
    if (session === null) return;
    await this.load(session.id, { silent: true, preserveLive: true });
  }

  private ensureStream(force = false): void {
    const session = this.sessionState();
    if (session === null || session.status === 'completed') {
      this.closeStream();
      return;
    }

    if (!force && this.stream !== null) return;

    this.closeStream();
    this.connectionState.set('connecting');
    const stream = new SessionEventStream({
      url: this.api.eventsUrl(session.id),
      factory: this.eventSourceFactory,
      onEvent: (event) => this.handleEvent(event),
      onState: (state) => this.connectionState.set(state),
      onTransportError: () => {
        void this.reconcileNow();
      },
    });
    this.stream = stream;
    stream.connect();
  }

  private closeStream(): void {
    this.stream?.close();
    this.stream = null;
  }

  private voidAnnounce(message: string): void {
    void this.announcer.announce(message, 'polite');
  }
}

function asClientError(error: unknown): ApiClientError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return error as ApiClientError;
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Something unexpected happened while updating this course.',
    retryable: false,
    details: {},
    status: null,
  };
}

function computeStats(session: SessionData): CourseStats {
  const words = session.sections.reduce(
    (total, section) => total + countWords(section.markdown ?? ''),
    0,
  );
  return {
    sections: session.sections.length,
    words,
    readingMinutes: Math.max(1, Math.ceil(words / 200)),
  };
}
