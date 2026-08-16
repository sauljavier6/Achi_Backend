import { NextFunction, Request, Response } from "express";
const attempts = new Map<string, { count: number; resetAt: number }>();
export function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = attempts.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + 15 * 60_000 } : current;
  entry.count += 1;
  attempts.set(key, entry);
  if (entry.count > 10) {
    res.status(429).json({ message: "Demasiados intentos. Intenta nuevamente más tarde." });
    return;
  }
  next();
}
