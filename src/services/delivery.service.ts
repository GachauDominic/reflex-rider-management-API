import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { deliveries, deliveryEvents, users } from "../db/schema";
import { AppError, ConflictError, NotFoundError } from "../middleware/errorHandler";
import { isNonEmptyString, isValidKenyanPhone, ValidationError } from "../utils/validation";
import { generateConfirmationCode, isWellFormedConfirmationCode } from "../utils/confirmationCode";
import { VALID_TRANSITIONS, canTransition } from "../utils/stateMachine";
import { deliveryEventBus } from "../utils/eventBus";
import { AuthTokenPayload, DeliveryStatus } from "../types";

/** Inverts VALID_TRANSITIONS so we can atomically guard updates by prior status. */
function statusesThatCanReach(target: DeliveryStatus): DeliveryStatus[] {
  return (Object.keys(VALID_TRANSITIONS) as DeliveryStatus[]).filter((from) =>
    VALID_TRANSITIONS[from].includes(target)
  );
}

async function recordEvent(
  deliveryId: string,
  actorId: string | null,
  status: DeliveryStatus,
  note?: string
) {
  await db.insert(deliveryEvents).values({ deliveryId, actorId, status, note });
}

// ---------- create ----------
export interface CreateDeliveryInput {
  customerName?: unknown;
  customerPhone?: unknown;
  address?: unknown;
  itemDescription?: unknown;
}

export async function createDelivery(retailerId: string, input: CreateDeliveryInput) {
  const { customerName, customerPhone, address, itemDescription } = input;

  if (!isNonEmptyString(customerName, 120)) {
    throw new ValidationError("customerName is required");
  }
  if (!isNonEmptyString(customerPhone) || !isValidKenyanPhone(customerPhone)) {
    throw new ValidationError("customerPhone must be a valid Kenyan phone number");
  }
  if (!isNonEmptyString(address, 500)) {
    throw new ValidationError("address is required");
  }
  if (!isNonEmptyString(itemDescription, 500)) {
    throw new ValidationError("itemDescription is required");
  }

  const confirmationCode = generateConfirmationCode();

  const [created] = await db
    .insert(deliveries)
    .values({
      retailerId,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      address: address.trim(),
      itemDescription: itemDescription.trim(),
      status: "OPEN",
      confirmationCode,
    })
    .returning();

  await recordEvent(created.id, retailerId, "OPEN", "Delivery created");

  deliveryEventBus.publish({ type: "DELIVERY_CREATED", delivery: created });

  return created;
}

// ---------- list ----------
export async function listDeliveriesForActor(actor: AuthTokenPayload, statusFilter: unknown) {
  const conditions = [];

  if (actor.role === "RETAILER") {
    conditions.push(eq(deliveries.retailerId, actor.sub));
  } else if (actor.role === "RIDER") {
    conditions.push(eq(deliveries.riderId, actor.sub));
  }
  // DISPATCHER sees everything by default.

  if (typeof statusFilter === "string" && statusFilter.length > 0) {
    conditions.push(eq(deliveries.status, statusFilter.toUpperCase() as DeliveryStatus));
  }

  return db
    .select()
    .from(deliveries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(deliveries.createdAt));
}

// ---------- get one ----------
export async function getDeliveryForActor(actor: AuthTokenPayload, id: string) {
  const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  if (!delivery) throw new NotFoundError("Delivery not found");

  const isOwnerRetailer = actor.role === "RETAILER" && delivery.retailerId === actor.sub;
  const isAssignedRider = actor.role === "RIDER" && delivery.riderId === actor.sub;
  const isDispatcher = actor.role === "DISPATCHER";

  if (!isOwnerRetailer && !isAssignedRider && !isDispatcher) {
    throw new AppError("You do not have access to this delivery", 403);
  }

  const history = await db
    .select()
    .from(deliveryEvents)
    .where(eq(deliveryEvents.deliveryId, id))
    .orderBy(deliveryEvents.timestamp);

  return { ...delivery, events: history };
}

// ---------- assign ----------
export async function assignDelivery(dispatcherId: string, id: string, riderId: unknown) {
  if (!isNonEmptyString(riderId)) {
    throw new ValidationError("riderId is required");
  }

  const [rider] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, riderId))
    .limit(1);

  if (!rider || rider.role !== "RIDER") {
    throw new ValidationError("riderId does not refer to a valid rider");
  }

  // Atomic: only succeeds if the delivery is still OPEN. If two dispatchers
  // race to assign the same delivery, only the first UPDATE matches the
  // WHERE clause — the second gets zero rows back and a 409, never a
  // silent double-assignment.
  const [updated] = await db
    .update(deliveries)
    .set({ riderId, status: "ASSIGNED", updatedAt: new Date() })
    .where(and(eq(deliveries.id, id), eq(deliveries.status, "OPEN")))
    .returning();

  if (!updated) {
    const [existing] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    if (!existing) throw new NotFoundError("Delivery not found");
    throw new ConflictError(
      `Delivery is no longer OPEN (current status: ${existing.status}) and cannot be assigned`
    );
  }

  await recordEvent(id, dispatcherId, "ASSIGNED", `Assigned to rider ${riderId}`);
  deliveryEventBus.publish({ type: "DELIVERY_ASSIGNED", delivery: updated });

  return updated;
}

// ---------- cancel ----------
// A dedicated function (mirroring confirm) rather than folding CANCELLED
// into the generic status update, because "who is allowed to cancel"
// differs by role in a way that doesn't fit the rider-only status path:
// a retailer may cancel their own order any time before it's delivered,
// a dispatcher may cancel anything, a rider may only cancel a job assigned
// to them.
export async function cancelDelivery(actor: AuthTokenPayload, id: string, note: unknown) {
  const [existing] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  if (!existing) throw new NotFoundError("Delivery not found");

  const role = actor.role;
  const isOwnerRetailer = role === "RETAILER" && existing.retailerId === actor.sub;
  const isAssignedRider = role === "RIDER" && existing.riderId === actor.sub;
  const isDispatcher = role === "DISPATCHER";

  if (!isOwnerRetailer && !isAssignedRider && !isDispatcher) {
    throw new AppError("You are not permitted to cancel this delivery", 403);
  }

  const cancellableFrom = statusesThatCanReach("CANCELLED");
  const conditions = [eq(deliveries.id, id), inArray(deliveries.status, cancellableFrom)];
  if (isOwnerRetailer) conditions.push(eq(deliveries.retailerId, actor.sub));
  if (isAssignedRider) conditions.push(eq(deliveries.riderId, actor.sub));

  const [updated] = await db
    .update(deliveries)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(and(...conditions))
    .returning();

  if (!updated) {
    throw new ConflictError(
      `Delivery cannot be cancelled from its current status (${existing.status})`
    );
  }

  await recordEvent(
    id,
    actor.sub,
    "CANCELLED",
    note == null ? undefined : String(note).slice(0, 500)
  );
  deliveryEventBus.publish({ type: "DELIVERY_CANCELLED", delivery: updated });

  return updated;
}

// ---------- status update (rider) ----------
export async function updateDeliveryStatus(actor: AuthTokenPayload, id: string, status: unknown, note: unknown) {
  const validStatuses: DeliveryStatus[] = ["PICKED_UP", "IN_TRANSIT"];

  if (typeof status !== "string" || !validStatuses.includes(status as DeliveryStatus)) {
    throw new ValidationError(
      "status must be one of PICKED_UP or IN_TRANSIT. Use /cancel to cancel, or /confirm to mark DELIVERED."
    );
  }

  const targetStatus = status as DeliveryStatus;
  const acceptableFrom = statusesThatCanReach(targetStatus);

  // A rider may only update their own assigned delivery.
  const [updated] = await db
    .update(deliveries)
    .set({ status: targetStatus, updatedAt: new Date() })
    .where(
      and(
        eq(deliveries.id, id),
        eq(deliveries.riderId, actor.sub),
        inArray(deliveries.status, acceptableFrom)
      )
    )
    .returning();

  if (!updated) {
    const [existing] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    if (!existing) throw new NotFoundError("Delivery not found");
    if (existing.riderId !== actor.sub) {
      throw new AppError("This delivery is not assigned to you", 403);
    }
    if (!canTransition(existing.status as DeliveryStatus, targetStatus)) {
      throw new ConflictError(
        `Cannot move delivery from ${existing.status} to ${targetStatus}`
      );
    }
    throw new ConflictError("Delivery was updated by someone else — refresh and retry");
  }

  await recordEvent(
    id, 
    actor.sub, 
    targetStatus, 
    note == null ? undefined : String(note).slice(0, 500));

  deliveryEventBus.publish({ type: "DELIVERY_STATUS_UPDATED", delivery: updated });

  return updated;
}

// ---------- confirm (QR scan) ----------
export async function confirmDelivery(riderId: string, id: string, confirmationCode: unknown) {
  if (!isNonEmptyString(confirmationCode) || !isWellFormedConfirmationCode(confirmationCode)) {
    throw new ValidationError("A valid confirmationCode is required");
  }

  const [existing] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  if (!existing) throw new NotFoundError("Delivery not found");

  if (existing.riderId !== riderId) {
    throw new AppError("This delivery is not assigned to you", 403);
  }
  if (existing.confirmationCode !== confirmationCode.trim().toUpperCase()) {
    throw new AppError("Confirmation code does not match this delivery", 400);
  }
  if (existing.status === "DELIVERED") {
    throw new ConflictError("Delivery has already been confirmed as delivered");
  }
  if (existing.status !== "IN_TRANSIT") {
    throw new ConflictError(
      `Delivery must be IN_TRANSIT before it can be confirmed (current status: ${existing.status})`
    );
  }

  // Atomic guard: only one concurrent confirm attempt can win.
  const [updated] = await db
    .update(deliveries)
    .set({ status: "DELIVERED", deliveredAt: new Date(), updatedAt: new Date() })
    .where(and(eq(deliveries.id, id), eq(deliveries.status, "IN_TRANSIT")))
    .returning();

  if (!updated) {
    throw new ConflictError("Delivery confirmation already completed by another request");
  }

  await recordEvent(id, riderId, "DELIVERED", "Confirmed via QR code scan");
  deliveryEventBus.publish({ type: "DELIVERY_DELIVERED", delivery: updated });

  return updated;
}
