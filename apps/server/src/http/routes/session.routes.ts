import { Router } from 'express';
import { z } from 'zod';
import { createSessionRequestSchema, updateSessionInputsRequestSchema } from '@ccb/contracts';

import type { SessionService } from '../../app/session-service.js';
import { asyncHandler } from '../async-handler.js';
import { getRequestId, sendSuccess } from '../response.js';
import { parseBody, parseSessionId } from '../validation.js';

const listQuerySchema = z
  .object({
    active: z.enum(['true']).optional(),
  })
  .strict();

export function createSessionRouter(service: SessionService): Router {
  const router = Router();

  router.get(
    '/sessions',
    asyncHandler(async (request, response) => {
      listQuerySchema.parse(request.query);
      const sessions = await service.listActive();
      sendSuccess(response, { sessions }, getRequestId(response));
    }),
  );

  router.post(
    '/sessions',
    asyncHandler(async (request, response) => {
      const input = parseBody(request, createSessionRequestSchema);
      const session = await service.create(input);
      sendSuccess(response, { session }, getRequestId(response), undefined, 201);
    }),
  );

  router.get(
    '/sessions/:id',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const session = await service.get(id);
      sendSuccess(response, { session }, getRequestId(response));
    }),
  );

  router.patch(
    '/sessions/:id/inputs',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const input = parseBody(request, updateSessionInputsRequestSchema);
      const session = await service.updateInputs(id, input);
      sendSuccess(response, { session }, getRequestId(response));
    }),
  );

  router.post(
    '/sessions/:id/outline',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const session = await service.startOutline(id);
      sendSuccess(response, { session }, getRequestId(response), undefined, 202);
    }),
  );

  router.post(
    '/sessions/:id/regenerate-outline',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const session = await service.regenerateOutline(id);
      sendSuccess(response, { session }, getRequestId(response), undefined, 202);
    }),
  );

  router.post(
    '/sessions/:id/approve',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const session = await service.approve(id);
      sendSuccess(response, { session }, getRequestId(response), undefined, 202);
    }),
  );

  router.post(
    '/sessions/:id/pause',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const session = await service.pause(id);
      sendSuccess(response, { session }, getRequestId(response), undefined, 202);
    }),
  );

  router.post(
    '/sessions/:id/stop',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const session = await service.stop(id);
      sendSuccess(response, { session }, getRequestId(response), undefined, 202);
    }),
  );

  router.post(
    '/sessions/:id/resume',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const session = await service.resume(id);
      sendSuccess(response, { session }, getRequestId(response), undefined, 202);
    }),
  );

  router.delete(
    '/sessions/:id',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const deletedId = await service.delete(id);
      sendSuccess(response, { deletedId }, getRequestId(response));
    }),
  );

  return router;
}
