import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const INITIAL_BUDGET_BYTES = 350 * 1024;
const browserDir = path.resolve('apps/web/dist/web/browser');
const indexPath = path.join(browserDir, 'index.html');

function fail(message) {
  process.stderr.write(`Bundle check failed: ${message}\n`);
  process.exitCode = 1;
}

function collect(pattern, html) {
  return [...html.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

let html;

try {
  html = readFileSync(indexPath, 'utf8');
} catch {
  fail(`could not read ${indexPath}. Run npm run build first.`);
  process.exit(1);
}

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)];
const inlineStyles = [...html.matchAll(/<style\b[^>]*>/gi)];

if (inlineScripts.length > 0) {
  fail('the built index contains an inline script. Disable inline critical CSS.');
}

if (inlineStyles.length > 0) {
  fail('the built index contains an inline style block. Disable inline critical CSS.');
}

const references = [
  ...collect(/<script\b[^>]*\bsrc="([^"]+)"/gi, html),
  ...collect(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi, html),
  ...collect(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/gi, html),
  ...collect(/<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="modulepreload"/gi, html),
];

const uniqueReferences = [...new Set(references)];
const files = [];
let totalRaw = 0;
let totalGzip = 0;

for (const reference of uniqueReferences) {
  const relative = reference.replace(/^\/+/, '').split('?')[0];
  const filePath = path.join(browserDir, relative);

  try {
    const contents = readFileSync(filePath);
    const gzip = gzipSync(contents, { level: 9 }).byteLength;
    files.push({ relative, raw: contents.byteLength, gzip });
    totalRaw += contents.byteLength;
    totalGzip += gzip;
  } catch {
    fail(`could not read initial asset ${relative}.`);
  }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

process.stdout.write('Initial application graph (from index.html):\n');

for (const file of files) {
  process.stdout.write(
    `  ${file.relative.padEnd(42)} ${kb(file.raw).padStart(10)}  gzip ${kb(file.gzip).padStart(10)}\n`,
  );
}

process.stdout.write(
  `  ${'TOTAL'.padEnd(42)} ${kb(totalRaw).padStart(10)}  gzip ${kb(totalGzip).padStart(10)}\n`,
);

const katexInInitial = uniqueReferences.some((reference) => /katex|vendor\//i.test(reference));
const katexJsInInitial = files.some((file) => {
  if (!file.relative.endsWith('.js')) return false;
  const js = readFileSync(path.join(browserDir, file.relative), 'utf8');
  return /renderMathInElement|katex/i.test(js);
});
const katexCssInInitial = files.some((file) => {
  if (!file.relative.endsWith('.css')) return false;
  const css = readFileSync(path.join(browserDir, file.relative), 'utf8');
  return /\.katex-html|katex-mathml|KaTeX_/.test(css);
});

if (katexInInitial || katexJsInInitial || katexCssInInitial) {
  fail('KaTeX assets or styles were pulled into the initial graph.');
}

if (totalGzip > INITIAL_BUDGET_BYTES) {
  fail(`initial gzip size ${kb(totalGzip)} exceeds the ${kb(INITIAL_BUDGET_BYTES)} budget.`);
}

if (process.exitCode !== 1) {
  process.stdout.write(`Initial gzip budget: ${kb(totalGzip)} / ${kb(INITIAL_BUDGET_BYTES)}.\n`);
}
