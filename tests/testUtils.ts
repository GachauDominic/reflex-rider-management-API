import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { signToken } from "../src/utils/jwt";
import { asyncHandler } from "../src/middleware/errorHandler";
import { AuthTokenPayload, UserRole, DeliveryStatus } from "../src/types";
import { User, Delivery, DeliveryEvent } from "../src/db/schema";

// ---------------------------------------------------------------------
// Fixtures. These are plain in-memory objects — nothing here inserts a
// row anywhere. They're typed against the real Drizzle-inferred types
// (User / Delivery / DeliveryEvent from src/db/schema.ts), so if a
// column is ever renamed, dropped, or its type changes, these fixtures
// fail to *compile* instead of silently drifting out of sync with the
// real schema.
// ---------------------------------------------------------------------

let counter = 0;
function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@reflex.test`;
}

export function mockUserRow(role: UserRole, overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
    name: `Test ${role[0]}${role.slice(1).toLowerCase()}`,
    email: uniqueEmail(role.toLowerCase()),
    passwordHash: "$2a$10$fixturefixturefixturefixturefixturefixt", // never verified in these tests
    role,
    phone: "0712345678",
    createdAt: new Date(),
    ...overrides,
  };
}

export function mockDeliveryRow(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: randomUUID(),
    retailerId: randomUUID(),
    riderId: null,
    customerName: "Jane Wanjiku",
    customerPhone: "0712345678",
    address: "Westlands, Nairobi",
    itemDescription: "Samsung 55 inch TV",
    status: "OPEN" as DeliveryStatus,
    confirmationCode: "REF-DEL-A1B2C3D4-X8K2",
    createdAt: new Date(),
    updatedAt: new Date(),
    deliveredAt: null,
    ...overrides,
  };
}

export function mockDeliveryEventRow(overrides: Partial<DeliveryEvent> = {}): DeliveryEvent {
  return {
    id: randomUUID(),
    deliveryId: randomUUID(),
    actorId: randomUUID(),
    status: "OPEN" as DeliveryStatus,
    note: null,
    timestamp: new Date(),
    ...overrides,
  };
}

/** A plain (unsigned) identity — pair with authHeaderFor() to sign it. */
export function mockActor(role: UserRole, overrides: Partial<AuthTokenPayload> = {}): AuthTokenPayload {
  return {
    sub: randomUUID(),
    role,
    email: uniqueEmail(role.toLowerCase()),
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Auth. signToken() here is the REAL implementation from src/utils/jwt.ts
// — it is intentionally NOT mocked. That's what lets these tests
// genuinely exercise the real authenticate()/authorize() middleware
// (real signature verification, real expiry handling) rather than
// asserting against a stand-in. Only the DB and the controllers are
// mocked, per the "thinnest coverage" scope for this suite.
// ---------------------------------------------------------------------

export function authHeaderFor(payload: AuthTokenPayload): { Authorization: string } {
  return { Authorization: `Bearer ${signToken(payload)}` };
}

// ---------------------------------------------------------------------
// Fake controllers. Routes call the real (mocked-module) exported
// function directly — Express does not know it's a jest.fn(). Wrapping
// each fake implementation with the SAME asyncHandler used by real
// controllers means a thrown/rejected error inside a fake controller is
// forwarded to next(err) exactly like production, so these tests verify
// the real errorHandler middleware rather than re-implementing its logic.
// ---------------------------------------------------------------------

export function fakeController(impl: (req: Request, res: Response) => void | Promise<void>) {
  return asyncHandler(async (req: Request, res: Response) => {
    await impl(req, res);
  });
}
