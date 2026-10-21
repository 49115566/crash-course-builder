import type { ErrorCode } from '@ccb/contracts';

type HintCode = ErrorCode | 'NETWORK_ERROR';

export function sessionErrorHint(error: { code: HintCode }): string {
  switch (error.code) {
    case 'KEY_MISSING':
      return 'Add your DeepSeek key with npm run key:set, then resume.';
    case 'AI_AUTH_INVALID':
      return 'DeepSeek rejected the API key. Run npm run key:set with a valid key, then resume.';
    case 'AI_INSUFFICIENT_BALANCE':
      return 'The DeepSeek account has insufficient balance. Add credit, then resume manually.';
    case 'AI_RATE_LIMITED':
      return 'DeepSeek is rate limiting requests. Wait a little, then resume manually.';
    case 'AI_TIMEOUT':
      return 'The AI call timed out. Nothing restarts automatically; resume when ready.';
    case 'AI_NETWORK':
      return 'The DeepSeek service could not be reached. Check your connection, then resume.';
    case 'AI_UPSTREAM':
      return 'DeepSeek returned an error. Your completed work is safe; resume when ready.';
    case 'OUTLINE_INVALID':
      return 'The outline did not meet the course format. Try generating a new outline.';
    case 'LIBRARY_UNAVAILABLE':
      return 'The library folder is unavailable. Check it is writable, then resume.';
    case 'GENERATION_BUSY':
      return 'Another course is being generated. Finish or pause it before continuing here.';
    case 'EXPANSION_STARTED':
      return 'Writing has already started. Resume or discard this session instead.';
    default:
      return 'Nothing restarts automatically. Your completed work is preserved.';
  }
}
