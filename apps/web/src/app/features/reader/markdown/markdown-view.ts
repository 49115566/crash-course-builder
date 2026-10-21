import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';

import { enhanceRenderedMarkdown } from './heading-enhancer';
import { renderCourseMath } from './math-renderer';

@Component({
  selector: 'ccb-markdown-view',
  imports: [MarkdownComponent],
  template: `<markdown [data]="markdown()" (ready)="onReady()" />`,
  styleUrl: './markdown-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownView {
  private readonly markdownComponent = viewChild.required(MarkdownComponent);
  private readonly host = inject(ElementRef<HTMLElement>);
  private renderedMarkdown: string | null = null;

  readonly markdown = input.required<string>();
  readonly headingIds = input<readonly string[]>([]);
  readonly renderMath = input(true);
  readonly rendered = output<HTMLElement>();

  protected onReady(): void {
    const element = this.markdownComponent().element.nativeElement;
    const markdown = this.markdown();
    const isNewContent = this.renderedMarkdown !== markdown;
    this.renderedMarkdown = markdown;

    enhanceRenderedMarkdown(element, this.headingIds());

    if (this.renderMath() && isNewContent) {
      renderCourseMath(element);
    }

    this.rendered.emit(this.host.nativeElement);
  }
}
