import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
] as const;

const ALLOWED_ATTRIBUTES = [
  'aria-label',
  'class',
  'colspan',
  'href',
  'id',
  'rowspan',
  'scope',
  'start',
  'title',
] as const;

const SAFE_URI = /^(?:https?:\/\/|mailto:|#|\/(?!\/)|\.{1,2}\/)|^(?:[\w.-]+\/[\w./-]*)$/iu;

export function sanitizeMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTRIBUTES],
    ALLOWED_URI_REGEXP: SAFE_URI,
    FORBID_TAGS: [
      'audio',
      'base',
      'button',
      'embed',
      'form',
      'iframe',
      'img',
      'input',
      'link',
      'meta',
      'object',
      'picture',
      'script',
      'style',
      'svg',
      'video',
    ],
    FORBID_ATTR: ['action', 'formaction', 'src', 'srcset', 'style', 'target', 'xlink:href'],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  });
}
