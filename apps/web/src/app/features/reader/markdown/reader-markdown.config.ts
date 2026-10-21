import { MARKED_OPTIONS, MarkedRenderer, SANITIZE, provideMarkdown } from 'ngx-markdown';

import { sanitizeMarkdownHtml } from './markdown-sanitizer';

function createReaderMarkedOptions() {
  const renderer = new MarkedRenderer();

  renderer.html = () => '';
  renderer.image = () => '';

  return {
    renderer,
    gfm: true,
    breaks: false,
    pedantic: false,
  };
}

export const READER_MARKDOWN_PROVIDERS = provideMarkdown({
  sanitize: {
    provide: SANITIZE,
    useValue: sanitizeMarkdownHtml,
  },
  markedOptions: {
    provide: MARKED_OPTIONS,
    useFactory: createReaderMarkedOptions,
  },
});
