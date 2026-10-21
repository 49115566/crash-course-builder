export interface KeyValidationResult {
  valid: boolean;
  message: string;
}

export interface ValidateKeyOptions {
  baseUrl: string;
  key: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function validateDeepSeekKey(
  options: ValidateKeyOptions,
): Promise<KeyValidationResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? 10_000);
  timeout.unref();

  try {
    const response = await fetchImpl(`${options.baseUrl.replace(/\/+$/, '')}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${options.key}` },
      signal: controller.signal,
    });

    if (response.status === 401) {
      return { valid: false, message: 'DeepSeek rejected the API key.' };
    }

    if (response.status === 402) {
      return {
        valid: false,
        message: 'The DeepSeek account has insufficient balance for this key.',
      };
    }

    if (!response.ok) {
      return {
        valid: false,
        message: `DeepSeek returned HTTP ${String(response.status)} while validating the key.`,
      };
    }

    return { valid: true, message: 'The DeepSeek key is valid.' };
  } catch (error) {
    if (controller.signal.aborted) {
      return { valid: false, message: 'DeepSeek key validation timed out.' };
    }

    return {
      valid: false,
      message: `The DeepSeek key could not be validated: ${
        error instanceof Error ? error.message : 'network error'
      }`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
