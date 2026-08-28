import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------- Enums ----------

export const userRoleEnum = pgEnum("user_role", [
  "RETAILER",
  "DISPATCHER",
  "RIDER",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "OPEN",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
]);

// ---------- Tables ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    phone: varchar("phone", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roleIdx: index("users_role_idx").on(table.role),
  })
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    riderId: uuid("rider_id").references(() => users.id, {
      onDelete: "set null",
    }),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
    address: text("address").notNull(),
    itemDescription: text("item_description").notNull(),
    status: deliveryStatusEnum("status").notNull().default("OPEN"),
    // Unique confirmation code used for QR-based proof of delivery,
    // e.g. REF-DEL-1042-X8K2. Generated at creation time.
    confirmationCode: varchar("confirmation_code", { length: 64 })
      .notNull()
      .unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("deliveries_status_idx").on(table.status),
    retailerIdx: index("deliveries_retailer_idx").on(table.retailerId),
    riderIdx: index("deliveries_rider_idx").on(table.riderId),
  })
);

export const deliveryEvents = pgTable(
  "delivery_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: deliveryStatusEnum("status").notNull(),
    note: text("note"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    deliveryIdx: index("delivery_events_delivery_idx").on(table.deliveryId),
  })
);

// ---------- Relations ----------

export const usersRelations = relations(users, ({ many }) => ({
  deliveriesAsRetailer: many(deliveries, { relationName: "retailer" }),
  deliveriesAsRider: many(deliveries, { relationName: "rider" }),
}));

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

// ---------- Inferred types ----------

export type TSUser = typeof users.$inferSelect;
export type TINewUser = typeof users.$inferInsert;
export type TSDelivery = typeof deliveries.$inferSelect;
export type TINewDelivery = typeof deliveries.$inferInsert;
export type TSDeliveryEvent = typeof deliveryEvents.$inferSelect;
export type TINewDeliveryEvent = typeof deliveryEvents.$inferInsert;
