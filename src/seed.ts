import "dotenv/config";
import { db, pool } from "./db";
import { users, deliveries, deliveryEvents } from "./db/schema";
import { hashPassword } from "./utils/password";
import { generateConfirmationCode } from "./utils/confirmationCode";

async function main() {
  console.log("Seeding Reflex demo data...");

  const passwordHash = await hashPassword("Password123!");

  const [retailer] = await db
    .insert(users)
    .values({
      name: "Sarah (Retailer)",
      email: "retailer@reflex.demo",
      passwordHash,
      role: "RETAILER",
      phone: "0712000001",
    })
    .returning();

  const [dispatcher] = await db
    .insert(users)
    .values({
      name: "David (Dispatcher)",
      email: "dispatcher@reflex.demo",
      passwordHash,
      role: "DISPATCHER",
      phone: "0712000002",
    })
    .returning();

  const [rider] = await db
    .insert(users)
    .values({
      name: "Mike (Rider)",
      email: "rider@reflex.demo",
      passwordHash,
      role: "RIDER",
      phone: "0712000003",
    })
    .returning();

  const [rider2] = await db
    .insert(users)
    .values({
      name: "Grace (Rider)",
      email: "rider2@reflex.demo",
      passwordHash,
      role: "RIDER",
      phone: "0712000004",
    })
    .returning();

  // Sample delivery #1 — still open, unassigned
  const [openDelivery] = await db
    .insert(deliveries)
    .values({
      retailerId: retailer.id,
      customerName: "Jane Wanjiku",
      customerPhone: "0712345678",
      address: "Westlands, Nairobi",
      itemDescription: "Samsung 55 inch TV",
      status: "OPEN",
      confirmationCode: generateConfirmationCode(),
    })
    .returning();
  await db.insert(deliveryEvents).values({
    deliveryId: openDelivery.id,
    actorId: retailer.id,
    status: "OPEN",
    note: "Delivery created",
  });

  // Sample delivery #2 — assigned and in transit
  const [inTransitDelivery] = await db
    .insert(deliveries)
    .values({
      retailerId: retailer.id,
      riderId: rider.id,
      customerName: "Peter Otieno",
      customerPhone: "0722334455",
      address: "Kilimani, Nairobi",
      itemDescription: "HP LaserJet Printer",
      status: "IN_TRANSIT",
      confirmationCode: generateConfirmationCode(),
    })
    .returning();
  for (const status of ["OPEN", "ASSIGNED", "PICKED_UP", "IN_TRANSIT"] as const) {
    await db.insert(deliveryEvents).values({
      deliveryId: inTransitDelivery.id,
      actorId: status === "OPEN" ? retailer.id : rider.id,
      status,
      note: status === "OPEN" ? "Delivery created" : undefined,
    });
  }

  // Sample delivery #3 — completed
  const [deliveredDelivery] = await db
    .insert(deliveries)
    .values({
      retailerId: retailer.id,
      riderId: rider2.id,
      customerName: "Mary Achieng",
      customerPhone: "0733445566",
      address: "Karen, Nairobi",
      itemDescription: "Assorted pharmacy order",
      status: "DELIVERED",
      confirmationCode: generateConfirmationCode(),
      deliveredAt: new Date(),
    })
    .returning();
  for (const status of ["OPEN", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"] as const) {
    await db.insert(deliveryEvents).values({
      deliveryId: deliveredDelivery.id,
      actorId: status === "OPEN" ? retailer.id : rider2.id,
      status,
      note: status === "OPEN" ? "Delivery created" : status === "DELIVERED" ? "Confirmed via QR code scan" : undefined,
    });
  }

  console.log("Seed complete. Demo accounts (password for all: Password123!):");
  console.log("  retailer@reflex.demo   (RETAILER)");
  console.log("  dispatcher@reflex.demo (DISPATCHER)");
  console.log("  rider@reflex.demo      (RIDER)");
  console.log("  rider2@reflex.demo     (RIDER)");

  await pool.end();
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
