import { relations } from "drizzle-orm";
import { users, deliveries, deliveryEvents } from "./schema";

// ---------- users ----------
// A user can be the retailer on many deliveries, the rider on many
// deliveries, and the actor behind many delivery events (creating,
// assigning, updating status, cancelling, confirming).
export const usersRelations = relations(users, ({ many }) => ({
  deliveriesAsRetailer: many(deliveries, { relationName: "retailer" }),
  deliveriesAsRider: many(deliveries, { relationName: "rider" }),
  deliveryEventsAsActor: many(deliveryEvents),
}));

// ---------- deliveries ----------
// Each delivery belongs to exactly one retailer and, once assigned,
// exactly one rider. It also has many events forming its audit trail.
export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  retailer: one(users, {
    fields: [deliveries.retailerId],
    references: [users.id],
    relationName: "retailer",
  }),
  rider: one(users, {
    fields: [deliveries.riderId],
    references: [users.id],
    relationName: "rider",
  }),
  events: many(deliveryEvents),
}));

// ---------- deliveryEvents ----------
// Each event belongs to exactly one delivery and was performed by
// exactly one actor (the user who triggered that status change).
export const deliveryEventsRelations = relations(deliveryEvents, ({ one }) => ({
  delivery: one(deliveries, {
    fields: [deliveryEvents.deliveryId],
    references: [deliveries.id],
  }),
  actor: one(users, {
    fields: [deliveryEvents.actorId],
    references: [users.id],
  }),
}));
