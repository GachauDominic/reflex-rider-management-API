import { Request, Response, NextFunction } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";

const loginLimiter = new RateLimiterMemory({
  points: Number(process.env.LOGIN_RATE_LIMIT_POINTS ?? 5),
  duration: Number(process.env.LOGIN_RATE_LIMIT_DURATION_SECONDS ?? 60),
});

const registrationLimiter = new RateLimiterMemory({
  points: Number(process.env.REGISTRATION_RATE_LIMIT_POINTS ?? 5),
  duration: Number(process.env.REGISTRATION_RATE_LIMIT_DURATION_SECONDS ?? 3600),
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

export async function registrationRateLimit(req: Request, res: Response, next: NextFunction) {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "unknown";
  try {
    await registrationLimiter.consume(`${req.ip}:${email}`);
    next();
  } catch {
    res.status(429).json({ error: "Too many registration attempts. Try again later." });
  }
}
