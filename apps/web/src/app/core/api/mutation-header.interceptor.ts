import type { HttpInterceptorFn } from '@angular/common/http';
import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE } from '@ccb/contracts';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const mutationHeaderInterceptor: HttpInterceptorFn = (request, next) => {
  const isApiRequest = request.url.startsWith('/api/');
  const isMutation = MUTATING_METHODS.has(request.method.toUpperCase());

  if (!isApiRequest || !isMutation) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: { [MUTATION_HEADER_NAME]: MUTATION_HEADER_VALUE },
    }),
  );
};
