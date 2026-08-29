process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "12h";

// Manual mock (src/db/__mocks__/index.ts) — real Postgres is never
// constructed; DATABASE_URL doesn't need to be set for this file either.
jest.mock("../../src/db");
// Auto-mocked: every exported controller function becomes a jest.fn()
// configured per test. Only routing + middleware (authenticate,
// authorize, errorHandler) run for real.
jest.mock("../../src/controllers/deliveries.controller");

import request from "supertest";
import { createApp } from "../../src/app";
import * as deliveriesController from "../../src/controllers/deliveries.controller";
import { AppError, ConflictError, NotFoundError } from "../../src/middleware/errorHandler";
import { ValidationError } from "../../src/utils/validation";
import { InvalidTransitionError } from "../../src/utils/stateMachine";
import { UserRole } from "../../src/types";
import { fakeController, mockActor, mockDeliveryRow, authHeaderFor } from "../testUtils";

const app = createApp();

/**
 * SCOPE — read this before extending the suite.
 *
 * These tests verify: route → middleware wiring, authenticate() token
 * checks, authorize() role checks, and errorHandler's status-code
 * mapping — all using the REAL middleware chain. The actual delivery
 * business logic (field validation, state-machine transitions, the
 * atomic WHERE-guarded updates that prevent two dispatchers racing to
 * assign the same delivery, event recording) lives in
 * delivery.service.ts and is entirely faked here via the mocked
 * controller. This suite CANNOT and does not verify that logic —
 * including the concurrency-race guarantee, which only means something
 * against a real database. That coverage would need dedicated unit/
 * integration tests that exercise delivery.service.ts against a real or
 * in-memory-equivalent Postgres, which is intentionally out of scope for
 * this "thinnest coverage" suite.
 */
describe("delivery routes (mocked db + controllers; real middleware)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Every route in deliveries.routes.ts runs authenticate() first via
  // router.use(authenticate) — confirm that once, generically, rather
  // than repeating it for all 7 endpoints below.
  describe("authentication (applies to every /api/deliveries/* route)", () => {
    it("rejects any request with no Authorization header", async () => {
      const res = await request(app).get("/api/deliveries");
      expect(res.status).toBe(401);
      expect(deliveriesController.listDeliveries).not.toHaveBeenCalled();
    });

    it("rejects an invalid/tampered token", async () => {
      const res = await request(app)
        .get("/api/deliveries")
        .set("Authorization", "Bearer garbage");
      expect(res.status).toBe(401);
      expect(deliveriesController.listDeliveries).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/deliveries (authorize: RETAILER only)", () => {
    it("RETAILER reaches the controller and gets its response back untouched", async () => {
      const actor = mockActor("RETAILER");
      const created = mockDeliveryRow({ retailerId: actor.sub, status: "OPEN" });

      (deliveriesController.createDelivery as jest.Mock).mockImplementation(
        fakeController((_req, res) => res.status(201).json(created))
      );

      const res = await request(app)
        .post("/api/deliveries")
        .set(authHeaderFor(actor))
        .send({
          customerName: "Jane Wanjiku",
          customerPhone: "0712345678",
          address: "Westlands, Nairobi",
          itemDescription: "Samsung 55 inch TV",
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(created)));
      expect(deliveriesController.createDelivery).toHaveBeenCalledTimes(1);
    });

    it.each<UserRole>(["DISPATCHER", "RIDER"])(
      "%s is forbidden (403), controller never reached",
      async (role) => {
        const actor = mockActor(role);

        const res = await request(app)
          .post("/api/deliveries")
          .set(authHeaderFor(actor))
          .send({});

        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          error: `Role '${role}' is not permitted to perform this action`,
        });
        expect(deliveriesController.createDelivery).not.toHaveBeenCalled();
      }
    );
  });

  describe("GET /api/deliveries (no role restriction beyond authentication)", () => {
    it.each<UserRole>(["RETAILER", "DISPATCHER", "RIDER"])(
      "%s reaches the controller and receives its list response",
      async (role) => {
        const actor = mockActor(role);
        const rows = [mockDeliveryRow(), mockDeliveryRow()];

        (deliveriesController.listDeliveries as jest.Mock).mockImplementation(
          fakeController((_req, res) => res.json(rows))
        );

        const res = await request(app).get("/api/deliveries").set(authHeaderFor(actor));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(JSON.parse(JSON.stringify(rows)));
      }
    );
  });

  describe("GET /api/deliveries/:id", () => {
    it("passes the route param through to the controller via req.params.id", async () => {
      const actor = mockActor("DISPATCHER");
      const delivery = mockDeliveryRow();
      let capturedId: unknown = null;

      (deliveriesController.getDelivery as jest.Mock).mockImplementation(
        fakeController((req, res) => {
          capturedId = req.params.id;
          res.json(delivery);
        })
      );

      const res = await request(app).get(`/api/deliveries/${delivery.id}`).set(authHeaderFor(actor));

      expect(res.status).toBe(200);
      expect(capturedId).toBe(delivery.id);
    });
  });

  describe("PATCH /api/deliveries/:id/assign (authorize: DISPATCHER only)", () => {
    it("DISPATCHER reaches the controller", async () => {
      const actor = mockActor("DISPATCHER");
      const updated = mockDeliveryRow({ status: "ASSIGNED" });

      (deliveriesController.assignDelivery as jest.Mock).mockImplementation(
        fakeController((_req, res) => res.json(updated))
      );

      const res = await request(app)
        .patch(`/api/deliveries/${updated.id}/assign`)
        .set(authHeaderFor(actor))
        .send({ riderId: "some-rider-id" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(updated)));
    });

    it.each<UserRole>(["RETAILER", "RIDER"])("%s is forbidden (403)", async (role) => {
      const actor = mockActor(role);
      const res = await request(app)
        .patch("/api/deliveries/some-id/assign")
        .set(authHeaderFor(actor))
        .send({ riderId: "x" });

      expect(res.status).toBe(403);
      expect(deliveriesController.assignDelivery).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/deliveries/:id/status (authorize: RIDER only)", () => {
    it("RIDER reaches the controller", async () => {
      const actor = mockActor("RIDER");
      const updated = mockDeliveryRow({ riderId: actor.sub, status: "PICKED_UP" });

      (deliveriesController.updateDeliveryStatus as jest.Mock).mockImplementation(
        fakeController((_req, res) => res.json(updated))
      );

      const res = await request(app)
        .patch(`/api/deliveries/${updated.id}/status`)
        .set(authHeaderFor(actor))
        .send({ status: "PICKED_UP" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(updated)));
    });

    it.each<UserRole>(["RETAILER", "DISPATCHER"])("%s is forbidden (403)", async (role) => {
      const actor = mockActor(role);
      const res = await request(app)
        .patch("/api/deliveries/some-id/status")
        .set(authHeaderFor(actor))
        .send({ status: "PICKED_UP" });

      expect(res.status).toBe(403);
      expect(deliveriesController.updateDeliveryStatus).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/deliveries/:id/cancel (authorize: RETAILER, DISPATCHER, RIDER)", () => {
    it.each<UserRole>(["RETAILER", "DISPATCHER", "RIDER"])(
      "%s reaches the controller (all three roles are permitted here)",
      async (role) => {
        const actor = mockActor(role);
        const cancelled = mockDeliveryRow({ status: "CANCELLED" });

        (deliveriesController.cancelDelivery as jest.Mock).mockImplementation(
          fakeController((_req, res) => res.json(cancelled))
        );

        const res = await request(app)
          .patch(`/api/deliveries/${cancelled.id}/cancel`)
          .set(authHeaderFor(actor))
          .send({});

        expect(res.status).toBe(200);
        expect(res.body).toEqual(JSON.parse(JSON.stringify(cancelled)));
      }
    );
  });

  describe("POST /api/deliveries/:id/confirm (authorize: RIDER only)", () => {
    it("RIDER reaches the controller", async () => {
      const actor = mockActor("RIDER");
      const delivered = mockDeliveryRow({
        riderId: actor.sub,
        status: "DELIVERED",
        deliveredAt: new Date(),
      });

      (deliveriesController.confirmDelivery as jest.Mock).mockImplementation(
        fakeController((_req, res) => res.json(delivered))
      );

      const res = await request(app)
        .post(`/api/deliveries/${delivered.id}/confirm`)
        .set(authHeaderFor(actor))
        .send({ confirmationCode: delivered.confirmationCode });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(delivered)));
    });

    it.each<UserRole>(["RETAILER", "DISPATCHER"])("%s is forbidden (403)", async (role) => {
      const actor = mockActor(role);
      const res = await request(app)
        .post("/api/deliveries/some-id/confirm")
        .set(authHeaderFor(actor))
        .send({ confirmationCode: "REF-DEL-A1B2C3D4-X8K2" });

      expect(res.status).toBe(403);
      expect(deliveriesController.confirmDelivery).not.toHaveBeenCalled();
    });
  });

  // errorHandler is a single shared middleware, so proving it maps each
  // typed error correctly on ONE route also proves it for all of them —
  // that's the whole point of centralizing it rather than repeating a
  // try/catch per controller (see delivery.service.ts / errorHandler.ts).
  describe("error propagation through the real errorHandler (demonstrated via POST /)", () => {
    const actor = () => mockActor("RETAILER");
    const payload = {
      customerName: "Jane Wanjiku",
      customerPhone: "0712345678",
      address: "Westlands, Nairobi",
      itemDescription: "Samsung 55 inch TV",
    };

    it("ValidationError -> 400", async () => {
      (deliveriesController.createDelivery as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new ValidationError("customerPhone must be a valid Kenyan phone number");
        })
      );
      const res = await request(app).post("/api/deliveries").set(authHeaderFor(actor())).send(payload);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "customerPhone must be a valid Kenyan phone number" });
    });

    it("NotFoundError -> 404", async () => {
      (deliveriesController.createDelivery as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new NotFoundError("Delivery not found");
        })
      );
      const res = await request(app).post("/api/deliveries").set(authHeaderFor(actor())).send(payload);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Delivery not found" });
    });

    it("ConflictError -> 409", async () => {
      (deliveriesController.createDelivery as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new ConflictError("Delivery is no longer OPEN and cannot be assigned");
        })
      );
      const res = await request(app).post("/api/deliveries").set(authHeaderFor(actor())).send(payload);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Delivery is no longer OPEN and cannot be assigned" });
    });

    it("InvalidTransitionError -> 409", async () => {
      (deliveriesController.createDelivery as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new InvalidTransitionError("OPEN", "DELIVERED");
        })
      );
      const res = await request(app).post("/api/deliveries").set(authHeaderFor(actor())).send(payload);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Cannot transition delivery from OPEN to DELIVERED" });
    });

    it("a plain AppError with a custom status is honored as-is", async () => {
      (deliveriesController.createDelivery as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new AppError("You do not have access to this delivery", 403);
        })
      );
      const res = await request(app).post("/api/deliveries").set(authHeaderFor(actor())).send(payload);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "You do not have access to this delivery" });
    });

    it("an unrecognized thrown error falls back to a generic 500", async () => {
      (deliveriesController.createDelivery as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new Error("unexpected");
        })
      );
      const res = await request(app).post("/api/deliveries").set(authHeaderFor(actor())).send(payload);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Internal server error" });
    });
  });
});
