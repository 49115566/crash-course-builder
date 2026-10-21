import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MUTATION_HEADERS = { 'x-ccb-request': '1' };
const repoRoot = process.cwd();
const serverEntry = path.join(repoRoot, 'apps', 'server', 'dist', 'main.js');
const indexEntry = path.join(repoRoot, 'apps', 'web', 'dist', 'web', 'browser', 'index.html');

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a smoke-test port.'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await predicate();

    if (value !== null && value !== undefined && value !== false) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  fail(`Timed out waiting for ${label}.`);
}

function startServer({ port, root }) {
  const child = spawn(process.execPath, ['scripts/start.mjs', '--no-open'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CCB_PORT: String(port),
      CCB_LIBRARY_ROOT: path.join(root, 'library'),
      CCB_DATA_DIR: path.join(root, 'data'),
      CCB_CONFIG_DIR: path.join(root, 'config'),
      CCB_LOG_LEVEL: 'warn',
      CCB_AI_PROVIDER: 'fake',
      CCB_FAKE_AI_DELAY_MS: '10',
      CCB_FAKE_AI_CHUNK_SIZE: '40',
      CCB_DISABLE_KEYCHAIN: 'true',
      CCB_NO_OPEN: '1',
      DEEPSEEK_API_KEY: 'smoke-test-key',
    },
  });

  return child;
}

function waitForExit(child, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error('The smoke-test server did not shut down cleanly.'));
    }, timeoutMs);
    timer.unref();

    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

function stopServer(child, signal = 'SIGTERM') {
  if (child.exitCode === null && !child.killed) {
    child.kill(signal);
  }
}

async function jsonRequest(baseUrl, method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
        ? MUTATION_HEADERS
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let payload;

  try {
    payload = text.length === 0 ? null : JSON.parse(text);
  } catch {
    payload = text;
  }

  return { status: response.status, headers: response.headers, body: payload };
}

async function waitForHealth(baseUrl) {
  await waitFor(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      return response.ok;
    } catch {
      return false;
    }
  }, 'the smoke-test server health endpoint');
}

async function waitForSession(baseUrl, sessionId, predicate, label) {
  return waitFor(
    async () => {
      const response = await jsonRequest(baseUrl, 'GET', `/api/sessions/${sessionId}`);
      if (response.status !== 200) return false;
      const session = response.body?.data?.session;
      return predicate(session) ? session : false;
    },
    label,
    60_000,
  );
}

async function main() {
  if (!existsSync(serverEntry) || !existsSync(indexEntry)) {
    fail('Build output is missing. Run "npm run build" before "npm run smoke".');
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'ccb-smoke-'));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child = startServer({ port, root });

  try {
    await waitForHealth(baseUrl);
    log('Smoke: health endpoint is ready.');

    const index = await fetch(`${baseUrl}/`);
    const html = await index.text();
    const csp = index.headers.get('content-security-policy') ?? '';
    const nonceMatch = /<ccb-root[^>]*ngCspNonce="([^"]+)"/.exec(html);

    if (index.status !== 200 || !html.includes('<ccb-root')) {
      fail('The production index HTML was not served.');
    }
    if (nonceMatch === null || !csp.includes(`'nonce-${nonceMatch[1]}'`)) {
      fail('The CSP nonce was not injected into the production index.');
    }
    log('Smoke: production index and CSP nonce are correct.');

    const subject = await jsonRequest(baseUrl, 'POST', '/api/subjects', { name: 'Smoke Test' });
    if (subject.status !== 201) fail(`Subject creation failed with ${subject.status}.`);
    const subjectId = subject.body.data.subject.id;

    const created = await jsonRequest(baseUrl, 'POST', '/api/sessions', {
      subjectId,
      topic: 'Smoke Course',
      audience: 'release testers',
      instructions: 'Use practical examples.',
    });
    if (created.status !== 201) fail(`Session creation failed with ${created.status}.`);
    const sessionId = created.body.data.session.id;

    const outlined = await jsonRequest(baseUrl, 'POST', `/api/sessions/${sessionId}/outline`);
    if (outlined.status !== 202) fail(`Outline start failed with ${outlined.status}.`);
    await waitForSession(
      baseUrl,
      sessionId,
      (session) => session?.status === 'outline_review',
      'outline review',
    );

    const approved = await jsonRequest(baseUrl, 'POST', `/api/sessions/${sessionId}/approve`);
    if (approved.status !== 202) fail(`Approval failed with ${approved.status}.`);
    const completed = await waitForSession(
      baseUrl,
      sessionId,
      (session) => session?.status === 'completed',
      'course completion',
    );

    const savedPath = completed.savedPath;
    if (typeof savedPath !== 'string') fail('The completed session has no saved path.');
    const courseDir = path.join(root, 'library', savedPath);

    for (const file of ['course.md', 'outline.md', 'meta.json']) {
      if (!existsSync(path.join(courseDir, file))) {
        fail(`The completed course is missing ${file}.`);
      }
    }

    const course = await jsonRequest(baseUrl, 'GET', `/api/courses/${completed.courseId}`);
    if (course.status !== 200 || !course.body.data.courseMarkdown.includes('## 1.')) {
      fail('The saved course could not be read back through the API.');
    }
    if (!(await readFile(path.join(courseDir, 'course.md'), 'utf8')).includes('## 1.')) {
      fail('The saved course.md does not contain the expected sections.');
    }
    log('Smoke: fake-AI course workflow wrote and read all three files.');

    const interrupted = await jsonRequest(baseUrl, 'POST', '/api/sessions', {
      subjectId,
      topic: 'Interrupted Smoke Course',
      audience: 'release testers',
    });
    if (interrupted.status !== 201)
      fail(`Interrupted-session setup failed with ${interrupted.status}.`);
    const interruptedId = interrupted.body.data.session.id;
    await jsonRequest(baseUrl, 'POST', `/api/sessions/${interruptedId}/outline`);
    const active = await waitForSession(
      baseUrl,
      interruptedId,
      (session) => session?.status === 'generating_outline' || session?.status === 'outline_review',
      'an active outline generation',
    );

    if (active.status === 'outline_review') {
      await jsonRequest(baseUrl, 'POST', `/api/sessions/${interruptedId}/approve`);
      await waitForSession(
        baseUrl,
        interruptedId,
        (session) => session?.status === 'expanding',
        'an active section expansion',
      );
    }

    stopServer(child, 'SIGTERM');
    const exitCode = await waitForExit(child);
    if (exitCode !== 0) fail(`The server exited with code ${exitCode} during graceful shutdown.`);
    log('Smoke: graceful shutdown completed.');

    child = startServer({ port, root });
    await waitForHealth(baseUrl);
    const recovered = await waitForSession(
      baseUrl,
      interruptedId,
      (session) => session?.status === 'paused',
      'interrupted session recovery',
    );

    if (recovered.pauseReason !== 'interrupted') {
      fail('The recovered session was not marked as interrupted.');
    }
    log('Smoke: interrupted generation was recovered as a paused session.');

    stopServer(child, 'SIGTERM');
    await waitForExit(child);
    log('Smoke test passed.');
  } finally {
    stopServer(child, 'SIGKILL');
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `Smoke test failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
