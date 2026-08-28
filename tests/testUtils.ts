import { db, pool } from "../src/db";
import { users, deliveries, deliveryEvents } from "../src/db/schema";
import { hashPassword } from "../src/utils/password";
import { signToken } from "../src/utils/jwt";
import { UserRole } from "../src/types";

/**
 * Wipes all app tables. Run before each integration test so tests don't
 * leak state into one another. Requires DATABASE_URL to point at a
 * disposable test database — never point this at production data.
 */
export async function resetDatabase() {
  await db.delete(deliveryEvents);
  await db.delete(deliveries);
  await db.delete(users);
}

export async function closeDatabase() {
  await pool.end();
}

export async function createTestUser(role: UserRole, overrides: Partial<{
  name: string;
  email: string;
  phone: string;
  password: string;
}> = {}) {
  const password = overrides.password ?? "Password123!";
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? `${role} Test User`,
      email: overrides.email ?? `${role.toLowerCase()}-${Date.now()}-${Math.random()}@reflex.test`,
      phone: overrides.phone ?? "0712345678",
      passwordHash,
      role,
    })
    .returning();

  const token = signToken({ sub: user.id, role: user.role, email: user.email });

  return { user, token, password };
}
