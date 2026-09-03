import { eq } from "drizzle-orm";
import { db } from "../db";
import { TINewUser, users } from "../db/schema";
import { verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { isValidEmail, isNonEmptyString, isValidKenyanPhone } from "../utils/validation";
import { AppError } from "../middleware/errorHandler";
import { UserRole } from "../types";

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

export interface RegisterResults {
  user: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    id?: string | undefined;
    phone?: string | null | undefined;
    createdAt?: Date | undefined;
  };
}

// register a user 
export async function registerUser( user: TINewUser ) {
   if (
    !isNonEmptyString(user.name) ||
    !isNonEmptyString(user.email) ||
    !isValidEmail(user.email) ||
    !isNonEmptyString(user.passwordHash) ||
    (user.phone !== null && user.phone !== undefined && !isValidKenyanPhone(user.phone)) ||
    !isNonEmptyString(user.role)
  ) {
    throw new AppError("A valid email and password are required", 400);
  }
   await db
  .insert(users)
  .values(user)

  if (!user) {
    throw new AppError("Unable to create user", 400);
  } else {
    return "User created successfully"
  }
    
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
