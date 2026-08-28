import { Request, Response, NextFunction } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";

const loginLimiter = new RateLimiterMemory({
  points: Number(process.env.LOGIN_RATE_LIMIT_POINTS ?? 5),
  duration: Number(process.env.LOGIN_RATE_LIMIT_DURATION_SECONDS ?? 60),
});

/**
 * Throttles login attempts per IP + email combo to slow down credential
 * stuffing / brute force attempts without needing external infra.
 */
export async function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip}:${(req.body?.email || "unknown").toLowerCase()}`;
  try {
    await loginLimiter.consume(key);
    next();
  } catch {
    res.status(429).json({ error: "Too many login attempts. Try again shortly." });
  }
}
