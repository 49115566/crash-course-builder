import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SessionSummary } from '@ccb/contracts';

import {
  routeForSummary,
  sessionActionLabel,
  sessionStatusTone,
} from '../../../core/sessions/session-routing';
import { BadgeDirective } from '../../../shared/ui/badge/badge.directive';

@Component({
  selector: 'ccb-in-progress-strip',
  imports: [BadgeDirective, DatePipe, RouterLink],
  template: `
    <section class="in-progress" aria-labelledby="in-progress-title">
      <div class="in-progress__heading">
        <div>
          <p class="ccb-eyebrow">In progress</p>
          <h2 id="in-progress-title">Pick up where you left off</h2>
        </div>
        <span class="in-progress__count">{{ sessions().length }}</span>
      </div>

      @if (loading()) {
        <div class="in-progress__skeleton" aria-hidden="true">
          <span></span>
          <span></span>
        </div>
      } @else if (errorMessage(); as message) {
        <div class="in-progress__error" role="alert">
          <p>{{ message }}</p>
          <button
            type="button"
            class="ccb-button ccb-button--ghost ccb-button--sm"
            (click)="retry.emit()"
          >
            Try again
          </button>
        </div>
      } @else {
        <ul class="in-progress__list">
          @for (session of sessions(); track session.id) {
            <li class="in-progress__card">
              <div class="in-progress__card-top">
                <span ccbBadge [tone]="tone(session)" class="in-progress__status">
                  {{ label(session) }}
                </span>
                <span class="in-progress__updated">
                  {{ session.updatedAt | date: 'MMM d, h:mm a' }}
                </span>
              </div>

              <div class="in-progress__card-body">
                <p class="in-progress__subject">{{ session.subject.name }}</p>
                <h3>{{ session.title ?? session.topic }}</h3>
                @if (session.title !== undefined) {
                  <p class="in-progress__topic">{{ session.topic }}</p>
                }
                <p class="in-progress__progress">
                  @if (session.status === 'draft') {
                    Waiting for outline
                  } @else if (session.status === 'generating_outline') {
                    Composing the outline
                  } @else if (session.status === 'outline_review') {
                    Outline ready · {{ session.sectionCount }} sections
                  } @else {
                    {{ session.completedSections }} of {{ session.sectionCount }} sections written
                  }
                </p>
                @if (session.status === 'failed' && session.lastError; as error) {
                  <p class="in-progress__error-text">{{ error.message }}</p>
                }
              </div>

              <div class="in-progress__actions">
                <a
                  class="ccb-button ccb-button--primary ccb-button--sm"
                  [routerLink]="route(session)"
                >
                  {{ action(session) }}
                </a>
                <button
                  type="button"
                  class="in-progress__discard"
                  [disabled]="discarding() === session.id"
                  (click)="discard.emit(session)"
                >
                  {{ discarding() === session.id ? 'Discarding…' : 'Discard' }}
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './in-progress-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InProgressStrip {
  readonly sessions = input.required<SessionSummary[]>();
  readonly loading = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly discarding = input<string | null>(null);
  readonly retry = output<void>();
  readonly discard = output<SessionSummary>();

  protected label(session: SessionSummary): string {
    switch (session.status) {
      case 'draft':
        return 'Draft';
      case 'generating_outline':
        return 'Writing outline';
      case 'outline_review':
        return 'Outline ready';
      case 'expanding':
        return session.stage === 'finalization' ? 'Saving course' : 'Writing';
      case 'completed':
        return 'Complete';
      case 'paused':
        return 'Paused';
      case 'failed':
        return 'Paused — needs attention';
    }
  }

  protected tone(session: SessionSummary) {
    return sessionStatusTone(session);
  }

  protected action(session: SessionSummary): string {
    return sessionActionLabel(session);
  }

  protected route(session: SessionSummary): string {
    return routeForSummary(session);
  }
}
