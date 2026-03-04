import type { Request, Response, NextFunction } from "express";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // TODO: verify Bearer JWT using SESSION_SECRET
  // TODO: attach decoded payload to req.user
  next(); // remove when implemented
}
