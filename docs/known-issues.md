# Known issues

## KI-001: DeepSeek streaming always fails with `AI_NETWORK`

- **Status:** Resolved (2026-10-21)
- **Severity:** High — blocks all course generation
- **Affected area:** DeepSeek adapter (Milestone 3)
- **Discovered:** 2026-10-21
- **Introduced by:** `apps/server/src/adapters/deepseek/deepseek-provider.ts`
- **Not in Milestone 5 scope:** The reader work does not change providers or generation.

### Symptoms

Starting any outline generation fails immediately, or after a short delay, with:

```text
DeepSeek could not be reached. Check your connection, then resume manually.
```

The session is marked `failed` at stage `outline` with `code: AI_NETWORK`, zero token usage,
and no `outlineRaw`. The key may be valid, the network may be reachable, and `/api/health` may
report the key as configured.

### Confirmed cause

DeepSeek's OpenAI-compatible stream sends `"usage": null` on normal content chunks. The provider
types `usage` as optional but not nullable:

```ts
usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};
```

`mapUsage()` only handles `undefined`:

```ts
function mapUsage(usage: DeepSeekStreamChunk['usage']): AiChunk['usage'] | undefined {
  if (usage === undefined) {
    return undefined;
  }

  return {
    ...(usage.prompt_tokens === undefined ? {} : { promptTokens: usage.prompt_tokens }),
    // ...
  };
}
```

For `"usage": null`, this throws:

```text
TypeError: Cannot read properties of null (reading 'prompt_tokens')
```

The outer catch in `DeepSeekProvider.stream()` converts any non-`AiProviderError` to `AI_NETWORK`,
so an internal parsing error is presented as a connectivity failure.

### Evidence

- DeepSeek returned HTTP `200` and streamed normally from the same Node runtime and workspace.
- The first streamed event had this shape:

  ```json
  {
    "choices": [{ "delta": { "role": "assistant", "content": "" }, "finish_reason": null }],
    "usage": null
  }
  ```

- Running the built `DeepSeekProvider` with the exact failed session prompt failed in about 470 ms
  with the `TypeError` above as the error cause.
- Raw SSE parsing works; the failure occurs while mapping the streamed chunk.

### Minimal fix

1. Make the stream chunk type tolerate null usage:

   ```ts
   usage?: {
     prompt_tokens?: number;
     completion_tokens?: number;
     total_tokens?: number;
   } | null;
   ```

2. Treat null usage as absent:

   ```ts
   function mapUsage(usage: DeepSeekStreamChunk['usage']): AiChunk['usage'] | undefined {
     if (usage === undefined || usage === null) {
       return undefined;
     }
     // ...
   }
   ```

No retry logic or provider redesign is required.

### Regression test

Add a provider test where normal chunks include `"usage": null`, including the initial role-only
chunk. Assert that text is yielded and the stream completes. The existing tests only use
`usage: undefined` or a real usage object, so they do not catch this case.

### Optional follow-up

Narrow the outer error classification so internal parsing/mapping failures are reported as
`AI_UPSTREAM` rather than `AI_NETWORK`. This is not required to restore generation, but prevents
future adapter defects from being misdiagnosed as connectivity problems.

### Workaround

None for real DeepSeek generation. The deterministic fake provider (`CCB_AI_PROVIDER=fake`) can be
used for local UI and integration testing, but does not generate real course content.

### Resolution verification

After patching and rebuilding:

```bash
npm run test -w @ccb/server
npm run doctor
```

Then resume the failed session from the library. The outline should stream normally.
