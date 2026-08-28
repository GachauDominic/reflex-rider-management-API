import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { isValidEmail, isNonEmptyString } from "../utils/validation";
import { AppError } from "../middleware/errorHandler";

export interface LoginResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

/**
 * Verifies credentials and issues a JWT. Same generic error whether the
 * email doesn't exist or the password is wrong, so we don't leak which
 * emails are registered.
 */
export async function loginUser(email: unknown, password: unknown): Promise<LoginResult> {
  if (!isNonEmptyString(email) || !isValidEmail(email) || !isNonEmptyString(password)) {
    throw new AppError("A valid email and password are required", 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = signToken({ sub: user.id, role: user.role, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/** Fetches the profile of the currently authenticated user. */
export async function getCurrentUser(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      phone: users.phone,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}
