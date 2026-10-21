import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(route: AsyncRoute): RequestHandler {
  return (req, res, next) => {
    void route(req, res, next).catch(next);
  };
}
