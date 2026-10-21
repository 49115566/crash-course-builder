export interface SseMessage {
  event?: string;
  data: string;
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName: string | undefined;
  let dataLines: string[] = [];

  const dispatch = (): SseMessage | null => {
    if (dataLines.length === 0) {
      eventName = undefined;
      return null;
    }

    const message: SseMessage = {
      data: dataLines.join('\n'),
      ...(eventName === undefined ? {} : { event: eventName }),
    };
    eventName = undefined;
    dataLines = [];
    return message;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
      } else {
        buffer += decoder.decode(value, { stream: true });
      }

      let newline = buffer.indexOf('\n');

      while (newline >= 0) {
        const rawLine = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

        if (line.length === 0) {
          const message = dispatch();
          if (message !== null) {
            yield message;
          }
        } else if (line.startsWith(':')) {
          continue;
        } else {
          const separator = line.indexOf(':');
          const field = separator < 0 ? line : line.slice(0, separator);
          const valueText = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');

          if (field === 'event') {
            eventName = valueText;
          } else if (field === 'data') {
            dataLines.push(valueText);
          }
        }

        newline = buffer.indexOf('\n');
      }

      if (done) {
        if (buffer.length > 0) {
          const line = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
          }
          buffer = '';
        }

        const message = dispatch();
        if (message !== null) {
          yield message;
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
