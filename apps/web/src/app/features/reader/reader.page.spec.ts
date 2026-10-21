import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import type { ApiSuccess, CourseDetail } from '@ccb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { READER_MARKDOWN_PROVIDERS } from './markdown/reader-markdown.config';
import { ReaderPage } from './reader.page';

const COURSE_ID = '123e4567-e89b-42d3-a456-426614174010';

const COURSE: CourseDetail = {
  meta: {
    schemaVersion: 1,
    id: COURSE_ID,
    subject: {
      id: '123e4567-e89b-42d3-a456-42661417400a',
      name: 'Computer Science',
    },
    topic: 'Vector Databases',
    title: 'Vector Databases: A Crash Course',
    audience: 'software engineers',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    status: 'complete',
    ai: { provider: 'deepseek', model: 'deepseek-chat' },
    promptVersion: '1',
    stats: { sections: 2, words: 1200, readingMinutes: 6 },
  },
  outlineMarkdown: '# Outline\n',
  courseMarkdown: `# Vector Databases

> A practical guide to similarity search.

**Audience:** software engineers

## 1. Foundations

Embeddings are numeric representations. Inline math $x^2$ is useful.

| Measure | Meaning |
| --- | --- |
| Cosine | Angle |

## 2. Indexing

### HNSW

Indexes make search fast.
`,
};

describe('ReaderPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    Element.prototype.scrollIntoView = vi.fn();

    TestBed.configureTestingModule({
      imports: [ReaderPage],
      providers: [
        ...READER_MARKDOWN_PROVIDERS,
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { fragment: null } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  async function render(course: CourseDetail = COURSE): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ReaderPage);
    fixture.componentRef.setInput('id', course.meta.id);
    fixture.detectChanges();

    http.expectOne(`/api/courses/${course.meta.id}`).flush({
      data: course,
      requestId: 'request-1',
    } satisfies ApiSuccess<CourseDetail>);

    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  it('renders the cover, linked outline, Markdown, table, and math', async () => {
    const element = await render();

    expect(element.querySelector('#course-title')?.textContent).toContain(
      'Vector Databases: A Crash Course',
    );
    expect(element.querySelector('.reader-cover')?.textContent).toContain(
      'A practical guide to similarity search.',
    );
    expect(element.querySelectorAll('ccb-outline-list a')).toHaveLength(4);
    expect(element.querySelector('.reader-body h2')?.id).toBe('section-1');
    expect(element.querySelector('.reader-body h3')?.id).toBe('section-2-hnsw');
    expect(element.querySelector('.reader-body')?.textContent).toContain('numeric representations');
    expect(element.querySelector('.reader-body .reader-table-scroll table')).not.toBeNull();
    expect(element.querySelector('.reader-body .katex')).not.toBeNull();
    expect(element.querySelector('.reader-toolbar')?.textContent).toContain('6 min read');
  });

  it('jumps to a section and makes the heading programmatically focusable', async () => {
    const element = await render();
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('ccb-outline-list a'));
    const second = links.find((link) => link.getAttribute('href') === '#section-2');

    expect(second).toBeDefined();
    second?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(window.location.hash).toBe('#section-2');
    expect(document.getElementById('section-2')?.getAttribute('tabindex')).toBe('-1');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('shows a clear not-found state with recovery actions', async () => {
    const fixture = TestBed.createComponent(ReaderPage);
    fixture.componentRef.setInput('id', COURSE_ID);
    fixture.detectChanges();

    http.expectOne(`/api/courses/${COURSE_ID}`).flush(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'The course could not be found.',
          retryable: false,
          details: {},
        },
      },
      { status: 404, statusText: 'Not Found' },
    );

    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('#reader-error-title')?.textContent).toContain(
      'This course is not available',
    );
    expect(element.textContent).toContain('Back to library');
    expect(element.textContent).toContain('Try again');
  });

  it('explains when course files are missing', async () => {
    const fixture = TestBed.createComponent(ReaderPage);
    fixture.componentRef.setInput('id', COURSE_ID);
    fixture.detectChanges();

    http.expectOne(`/api/courses/${COURSE_ID}`).flush(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'This course is incomplete on disk.',
          retryable: false,
          details: { files: ['course.md'] },
        },
      },
      { status: 404, statusText: 'Not Found' },
    );

    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('missing course.md');
    expect(element.textContent).toContain('outline.md');
  });
});
