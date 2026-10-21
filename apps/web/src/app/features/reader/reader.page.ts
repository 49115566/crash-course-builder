import { CdkMenuModule } from '@angular/cdk/menu';
import { Dialog } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type { ApiClientError } from '../../core/api/api-error';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { CourseOutlineCard } from './components/course-outline-card';
import {
  ReaderContentsDialog,
  type ReaderContentsDialogData,
} from './components/reader-contents.dialog';
import { ReaderSidebar } from './components/reader-sidebar';
import { ReaderSkeleton } from './components/reader-skeleton';
import { MarkdownView } from './markdown/markdown-view';
import { parseCourseDocument } from './markdown/course-document';
import { ReaderStore } from './reader.store';

@Component({
  selector: 'ccb-reader-page',
  imports: [
    CdkMenuModule,
    CourseOutlineCard,
    DatePipe,
    MarkdownView,
    ReaderSidebar,
    ReaderSkeleton,
    RouterLink,
  ],
  templateUrl: './reader.page.html',
  styleUrl: './reader.page.scss',
  providers: [ReaderStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderPage {
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly article = viewChild<ElementRef<HTMLElement>>('article');
  private frame: number | null = null;
  private bodyRoot: HTMLElement | null = null;
  private initialFragmentHandled = false;

  protected readonly store = inject(ReaderStore);
  protected readonly id = input.required<string>();
  protected readonly courseDocument = computed(() => {
    const course = this.store.course();
    return course === null ? null : parseCourseDocument(course.courseMarkdown);
  });
  protected readonly coverMarkdown = computed(() => this.courseDocument()?.coverMarkdown ?? '');
  protected readonly bodyMarkdown = computed(() => this.courseDocument()?.bodyMarkdown ?? '');
  protected readonly headings = computed(() => this.courseDocument()?.headings ?? []);
  protected readonly sectionHeadings = computed(() => this.courseDocument()?.sectionHeadings ?? []);
  protected readonly headingIds = computed(() => this.headings().map((heading) => heading.id));
  protected readonly activeHeadingId = signal<string | null>(null);
  protected readonly progress = signal(0);
  protected readonly showBackToTop = signal(false);
  protected readonly loading = computed(
    () => this.store.status() === 'idle' || this.store.status() === 'loading',
  );
  protected readonly hasError = computed(() => this.store.status() === 'error');
  protected readonly error = computed(() => this.store.error());
  protected readonly errorTitle = computed(() => {
    const error = this.error();
    if (error?.code === 'NOT_FOUND') {
      return 'This course is not available';
    }
    return 'We could not open this course';
  });
  protected readonly errorBody = computed(() => {
    const error = this.error();
    if (error === null) {
      return '';
    }

    const files = error.details['files'];
    if (Array.isArray(files) && files.length > 0) {
      return `The course folder is missing ${files.join(' and ')}. Restore those files on disk, then try again.`;
    }

    if (error.code === 'NOT_FOUND') {
      return 'It may have been moved or deleted on disk. Your library is unchanged.';
    }

    return error.message;
  });
  protected readonly sectionCount = computed(() => this.sectionHeadings().length);

  constructor() {
    effect(() => {
      const courseId = this.id();
      if (courseId.length > 0) {
        this.bodyRoot = null;
        this.initialFragmentHandled = false;
        this.activeHeadingId.set(null);
        this.progress.set(0);
        this.showBackToTop.set(false);
        void this.store.load(courseId);
      }
    });

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleScroll, { passive: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', this.handleScroll);
      window.removeEventListener('resize', this.handleScroll);
      if (this.frame !== null) {
        cancelAnimationFrame(this.frame);
      }
    });
  }

  protected onBodyRendered(element: HTMLElement): void {
    this.bodyRoot = element;
    this.handleScroll();

    if (!this.initialFragmentHandled) {
      this.initialFragmentHandled = true;
      const fragment = this.route.snapshot.fragment;
      if (fragment !== null && fragment.length > 0) {
        setTimeout(() => {
          this.scrollToHeading(fragment, false);
        }, 0);
      }
    }
  }

  protected jumpTo(id: string): void {
    this.scrollToHeading(id, true);
  }

  protected openContents(): void {
    const reference = this.dialog.open<string | undefined, ReaderContentsDialogData>(
      ReaderContentsDialog,
      {
        data: {
          headings: this.sectionHeadings(),
          activeId: this.activeHeadingId(),
          readingMinutes: this.store.course()?.meta.stats.readingMinutes ?? 0,
        },
        ariaLabel: 'Course contents',
        panelClass: ['ccb-dialog-panel', 'reader-contents-panel'],
        backdropClass: 'ccb-dialog-backdrop',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      },
    );

    void firstValueFrom(reference.closed).then((id) => {
      if (id !== undefined) {
        this.scrollToHeading(id, true);
      }
    });
  }

  protected printCourse(): void {
    window.print();
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.toast.success('Course link copied.');
    } catch {
      this.toast.info('Copy the address from your browser to share this course.');
    }
  }

  protected backToTop(): void {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    document.getElementById('course-title')?.focus({ preventScroll: true });
  }

  protected retry(): void {
    void this.store.retry();
  }

  protected isMissingFiles(): boolean {
    const files = this.store.error()?.details['files'];
    return Array.isArray(files) && files.length > 0;
  }

  protected errorCode(): ApiClientError['code'] | null {
    return this.store.error()?.code ?? null;
  }

  private readonly handleScroll = (): void => {
    if (this.frame !== null) {
      return;
    }

    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.measureReadingPosition();
    });
  };

  private measureReadingPosition(): void {
    const article = this.article()?.nativeElement;
    if (article === undefined) {
      return;
    }

    const body = this.bodyRoot;
    const threshold = 112;
    let active: string | null = null;

    if (body !== null) {
      for (const heading of Array.from(body.querySelectorAll<HTMLElement>('h2'))) {
        if (heading.getBoundingClientRect().top <= threshold) {
          active = heading.id;
        } else {
          break;
        }
      }
    }

    this.activeHeadingId.set(active);

    const articleTop = window.scrollY + article.getBoundingClientRect().top;
    const travel = Math.max(1, article.offsetHeight - window.innerHeight + 96);
    const scrolled = window.scrollY - articleTop + 96;
    const nextProgress = Math.min(100, Math.max(0, Math.round((scrolled / travel) * 100)));

    if (Math.abs(nextProgress - this.progress()) >= 1) {
      this.progress.set(nextProgress);
    }

    this.showBackToTop.set(window.scrollY > 640);
  }

  private scrollToHeading(id: string, updateUrl: boolean): void {
    const target = document.getElementById(id);
    if (target === null) {
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    this.activeHeadingId.set(id);

    if (updateUrl) {
      window.history.replaceState(window.history.state, '', `#${id}`);
    }
  }
}
