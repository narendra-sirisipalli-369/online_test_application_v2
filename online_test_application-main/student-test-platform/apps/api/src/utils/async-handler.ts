import type { NextFunction, Request, Response } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    void fn(req, res, next).catch(next);
  };
}
