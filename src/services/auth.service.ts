import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { isValidEmail, isNonEmptyString, isValidKenyanPhone, isValidPassword } from "../utils/validation";
import { AppError } from "../middleware/errorHandler";
import { UserRole } from "../types";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: string;
  phone?: string;
}

export interface LoginResult {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    passwordHash: string;
  };
}

export async function registerUser(input: RegisterInput) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = input.phone === null || input.phone === undefined ? null : input.phone;

  if (
    !isNonEmptyString(input.name, 120) ||
    !isValidEmail(email) ||
    !isValidPassword(input.password) ||
    (phone !== null && (typeof phone !== "string" || !isValidKenyanPhone(phone))) ||
    (input.role !== "RETAILER" && input.role !== "RIDER")
  ) {
    throw new AppError("Invalid registration details", 400);
  }

  const [user] = await db
    .insert(users)
    .values({
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role as UserRole,
      phone: phone as string | null,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone });

  return user;
    
}


/**
 * Verifies credentials and issues a JWT. Same generic error whether the
 * email doesn't exist or the password is wrong, so we don't leak which
 * emails are registered.
 */
export async function loginUser(email: string, password: string): Promise<LoginResult> {
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
      passwordHash: user.passwordHash
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
