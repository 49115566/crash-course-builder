import { Router } from 'express';
import type { SessionEvent } from '@ccb/contracts';

import type { SessionEventBus } from '../../app/event-bus.js';
import type { SessionService } from '../../app/session-service.js';
import { asyncHandler } from '../async-handler.js';
import { parseSessionId } from '../validation.js';

export interface EventsRouteOptions {
  heartbeatMs?: number;
}

export function createEventsRouter(
  service: SessionService,
  events: SessionEventBus,
  options: EventsRouteOptions = {},
): Router {
  const router = Router();
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  router.get(
    '/sessions/:id/events',
    asyncHandler(async (request, response) => {
      const id = parseSessionId(request);
      const buffered: SessionEvent[] = [];
      let ready = false;
      let closed = false;
      let heartbeat: NodeJS.Timeout | null = null;

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        if (heartbeat !== null) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe();
      };

      const send = (event: SessionEvent): void => {
        if (closed || response.writableEnded) return;

        try {
          response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        } catch {
          cleanup();
          response.end();
        }
      };

      const unsubscribe = events.subscribe(
        id,
        (event) => {
          if (ready) {
            send(event);
          } else {
            buffered.push(event);
          }
        },
        () => {
          cleanup();
          if (!response.writableEnded) response.end();
        },
      );

      let session;

      try {
        session = await service.get(id);
      } catch (error) {
        unsubscribe();
        throw error;
      }

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();

      heartbeat = setInterval(() => {
        if (!closed && !response.writableEnded) {
          response.write(': heartbeat\n\n');
        }
      }, heartbeatMs);
      heartbeat.unref();

      request.on('close', cleanup);

      send({
        type: 'snapshot',
        sessionId: session.id,
        at: new Date().toISOString(),
        session,
      });
      ready = true;

      for (const event of buffered.splice(0)) {
        send(event);
      }
    }),
  );

  return router;
}
