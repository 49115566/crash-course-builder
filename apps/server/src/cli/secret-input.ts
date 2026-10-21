import type { Readable, Writable } from 'node:stream';

export interface SecretInputOptions {
  stdin?: Readable & { isTTY?: boolean; setRawMode?: (mode: boolean) => void };
  stdout?: Writable;
}

export async function readSecretInput(options: SecretInputOptions = {}): Promise<string> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;

  const setRawMode = stdin.setRawMode?.bind(stdin);

  if (stdin.isTTY !== true || setRawMode === undefined) {
    return readPipedInput(stdin);
  }

  return new Promise<string>((resolve, reject) => {
    let value = '';
    const wasRaw = Boolean((stdin as Readable & { isRaw?: boolean }).isRaw);

    const cleanup = (): void => {
      stdin.removeListener('data', onData);
      setRawMode(wasRaw);
      stdin.pause();
    };

    const finish = (): void => {
      cleanup();
      stdout.write('\n');
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        reject(new Error('The API key cannot be empty.'));
        return;
      }
      resolve(trimmed);
    };

    const cancel = (): void => {
      cleanup();
      stdout.write('\n');
      reject(new Error('Key entry cancelled.'));
    };

    const onData = (chunk: Buffer | string): void => {
      const text = chunk.toString();

      for (const character of text) {
        if (character === '\u0003') {
          cancel();
          return;
        }

        if (character === '\r' || character === '\n' || character === '\u0004') {
          finish();
          return;
        }

        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }

        if (character >= ' ') {
          value += character;
        }
      }
    };

    setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

async function readPipedInput(stdin: Readable): Promise<string> {
  let contents = '';

  for await (const chunk of stdin) {
    contents += String(chunk);
  }

  const trimmed = contents.trim();

  if (trimmed.length === 0) {
    throw new Error('No API key was provided on standard input.');
  }

  return trimmed;
}
