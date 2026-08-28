import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { users, deliveries } from "../db/schema";
import { AppError } from "../middleware/errorHandler";
import { AuthTokenPayload } from "../types";

export async function listAllRiders() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.role, "RIDER"));
}

// A rider may only ever view their own delivery list; a dispatcher may
// view any rider's list.
export async function getRiderDeliveries(actor: AuthTokenPayload, riderId: string) {
  if (actor.role === "RIDER" && actor.sub !== riderId) {
    throw new AppError("Riders can only view their own deliveries", 403);
  }

  const [rider] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, riderId), eq(users.role, "RIDER")))
    .limit(1);

  if (!rider) {
    throw new AppError("Rider not found", 404);
  }

  return db
    .select()
    .from(deliveries)
    .where(eq(deliveries.riderId, riderId))
    .orderBy(desc(deliveries.createdAt));
}
