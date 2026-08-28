import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { UserRole } from "../types";

/**
 * Verifies the Bearer token on the Authorization header and attaches the
 * decoded payload to req.user. Rejects the request with 401 otherwise.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = header.slice("Bearer ".length);

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Same as authenticate(), but also accepts the token as a `?token=` query
 * param. Needed for the SSE endpoint because the browser EventSource API
 * cannot set a custom Authorization header.
 */
export function authenticateFlexible(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : (req.query.token as string | undefined);

  if (!token) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Restricts a route to one or more roles. Must run after authenticate().
 * A rider hitting a dispatcher-only route gets a 403, not a silent bypass.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Role '${req.user.role}' is not permitted to perform this action`,
      });
    }
    next();
  };
}
