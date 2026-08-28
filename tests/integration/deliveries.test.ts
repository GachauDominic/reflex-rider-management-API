import request from "supertest";
import { createApp } from "../../src/app";
import { resetDatabase, closeDatabase, createTestUser } from "../testUtils";
import { db } from "../../src/db";
import { deliveries } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const app = createApp();

const sampleDeliveryPayload = {
  customerName: "Jane Wanjiku",
  customerPhone: "0712345678",
  address: "Westlands, Nairobi",
  itemDescription: "Samsung 55 inch TV",
};

describe("Delivery lifecycle", () => {
  beforeEach(resetDatabase);
  afterAll(closeDatabase);

  describe("POST /api/deliveries (create)", () => {
    it("lets a retailer create a delivery in OPEN status", async () => {
      const { token } = await createTestUser("RETAILER");

      const res = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .send(sampleDeliveryPayload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("OPEN");
      expect(res.body.riderId).toBeNull();
      expect(res.body.confirmationCode).toMatch(/^REF-DEL-/);
    });

    it("rejects an invalid phone number and does not create a row", async () => {
      const { token } = await createTestUser("RETAILER");

      const res = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .send({ ...sampleDeliveryPayload, customerPhone: "12345" });

      expect(res.status).toBe(400);
      const rows = await db.select().from(deliveries);
      expect(rows.length).toBe(0);
    });

    it("rejects missing required fields", async () => {
      const { token } = await createTestUser("RETAILER");
      const res = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .send({ customerName: "Jane" });
      expect(res.status).toBe(400);
    });

    it("forbids a dispatcher from creating a delivery", async () => {
      const { token } = await createTestUser("DISPATCHER");
      const res = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .send(sampleDeliveryPayload);
      expect(res.status).toBe(403);
    });

    it("forbids a rider from creating a delivery", async () => {
      const { token } = await createTestUser("RIDER");
      const res = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .send(sampleDeliveryPayload);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/deliveries (list, role-scoped)", () => {
    it("shows a retailer only their own deliveries", async () => {
      const { token: retailerAToken } = await createTestUser("RETAILER", { email: "a@reflex.test" });
      const { token: retailerBToken } = await createTestUser("RETAILER", { email: "b@reflex.test" });

      await request(app).post("/api/deliveries").set("Authorization", `Bearer ${retailerAToken}`).send(sampleDeliveryPayload);
      await request(app).post("/api/deliveries").set("Authorization", `Bearer ${retailerBToken}`).send(sampleDeliveryPayload);

      const res = await request(app).get("/api/deliveries").set("Authorization", `Bearer ${retailerAToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it("shows a dispatcher every delivery", async () => {
      const { token: retailerToken } = await createTestUser("RETAILER");
      const { token: dispatcherToken } = await createTestUser("DISPATCHER");

      await request(app).post("/api/deliveries").set("Authorization", `Bearer ${retailerToken}`).send(sampleDeliveryPayload);
      await request(app).post("/api/deliveries").set("Authorization", `Bearer ${retailerToken}`).send(sampleDeliveryPayload);

      const res = await request(app).get("/api/deliveries").set("Authorization", `Bearer ${dispatcherToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  describe("PATCH /api/deliveries/:id/assign", () => {
    it("lets a dispatcher assign an OPEN delivery to a rider", async () => {
      const { token: retailerToken } = await createTestUser("RETAILER");
      const { token: dispatcherToken } = await createTestUser("DISPATCHER");
      const { user: rider } = await createTestUser("RIDER");

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailerToken}`)
        .send(sampleDeliveryPayload);

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcherToken}`)
        .send({ riderId: rider.id });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ASSIGNED");
      expect(res.body.riderId).toBe(rider.id);
    });

    it("rejects assignment to a non-rider user", async () => {
      const { token: retailerToken } = await createTestUser("RETAILER");
      const { user: notARider } = await createTestUser("RETAILER", {
        email: "notarider@reflex.test",
      });
      const { token: dispatcherToken } = await createTestUser("DISPATCHER");

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailerToken}`)
        .send(sampleDeliveryPayload);

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcherToken}`)
        .send({ riderId: notARider.id });

      expect(res.status).toBe(400);
    });

    it("prevents two dispatchers from assigning the same OPEN delivery (race condition)", async () => {
      const { token: retailerToken } = await createTestUser("RETAILER");
      const dispatcher1 = await createTestUser("DISPATCHER", { email: "d1@reflex.test" });
      const dispatcher2 = await createTestUser("DISPATCHER", { email: "d2@reflex.test" });
      const riderA = await createTestUser("RIDER", { email: "riderA@reflex.test" });
      const riderB = await createTestUser("RIDER", { email: "riderB@reflex.test" });

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailerToken}`)
        .send(sampleDeliveryPayload);

      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/deliveries/${created.body.id}/assign`)
          .set("Authorization", `Bearer ${dispatcher1.token}`)
          .send({ riderId: riderA.user.id }),
        request(app)
          .patch(`/api/deliveries/${created.body.id}/assign`)
          .set("Authorization", `Bearer ${dispatcher2.token}`)
          .send({ riderId: riderB.user.id }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const [finalRow] = await db.select().from(deliveries).where(eq(deliveries.id, created.body.id));
      expect(finalRow.status).toBe("ASSIGNED");
      expect([riderA.user.id, riderB.user.id]).toContain(finalRow.riderId);
    });

    it("rejects assigning a delivery that is not currently OPEN", async () => {
      const { token: retailerToken } = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider1 = await createTestUser("RIDER", { email: "r1@reflex.test" });
      const rider2 = await createTestUser("RIDER", { email: "r2@reflex.test" });

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailerToken}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider1.user.id });

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider2.user.id });

      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /api/deliveries/:id/status", () => {
    async function setupAssignedDelivery() {
      const retailer = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider = await createTestUser("RIDER");
      const otherRider = await createTestUser("RIDER", { email: "other-rider@reflex.test" });

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailer.token}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider.user.id });

      return { deliveryId: created.body.id as string, rider, otherRider };
    }

    it("walks a delivery through PICKED_UP then IN_TRANSIT", async () => {
      const { deliveryId, rider } = await setupAssignedDelivery();

      const pickedUp = await request(app)
        .patch(`/api/deliveries/${deliveryId}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "PICKED_UP" });
      expect(pickedUp.status).toBe(200);
      expect(pickedUp.body.status).toBe("PICKED_UP");

      const inTransit = await request(app)
        .patch(`/api/deliveries/${deliveryId}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "IN_TRANSIT" });
      expect(inTransit.status).toBe(200);
      expect(inTransit.body.status).toBe("IN_TRANSIT");
    });

    it("rejects a status update from a rider the delivery is not assigned to", async () => {
      const { deliveryId, otherRider } = await setupAssignedDelivery();

      const res = await request(app)
        .patch(`/api/deliveries/${deliveryId}/status`)
        .set("Authorization", `Bearer ${otherRider.token}`)
        .send({ status: "PICKED_UP" });

      expect(res.status).toBe(403);
    });

    it("rejects skipping PICKED_UP and going straight to IN_TRANSIT", async () => {
      const { deliveryId, rider } = await setupAssignedDelivery();

      const res = await request(app)
        .patch(`/api/deliveries/${deliveryId}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "IN_TRANSIT" });

      expect(res.status).toBe(409);
    });

    it("rejects trying to set DELIVERED through this endpoint", async () => {
      const { deliveryId, rider } = await setupAssignedDelivery();

      const res = await request(app)
        .patch(`/api/deliveries/${deliveryId}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "DELIVERED" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/deliveries/:id/confirm (QR confirmation)", () => {
    async function setupInTransitDelivery() {
      const retailer = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider = await createTestUser("RIDER");

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailer.token}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider.user.id });

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "PICKED_UP" });

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "IN_TRANSIT" });

      return {
        deliveryId: created.body.id as string,
        confirmationCode: created.body.confirmationCode as string,
        rider,
      };
    }

    it("confirms delivery with the correct code and moves status to DELIVERED", async () => {
      const { deliveryId, confirmationCode, rider } = await setupInTransitDelivery();

      const res = await request(app)
        .post(`/api/deliveries/${deliveryId}/confirm`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ confirmationCode });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("DELIVERED");
      expect(res.body.deliveredAt).toBeTruthy();
    });

    it("rejects an incorrect confirmation code", async () => {
      const { deliveryId, rider } = await setupInTransitDelivery();

      const res = await request(app)
        .post(`/api/deliveries/${deliveryId}/confirm`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ confirmationCode: "REF-DEL-DEADBEEF-0000" });

      expect(res.status).toBe(400);
    });

    it("rejects confirming the same delivery twice", async () => {
      const { deliveryId, confirmationCode, rider } = await setupInTransitDelivery();

      await request(app)
        .post(`/api/deliveries/${deliveryId}/confirm`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ confirmationCode });

      const res = await request(app)
        .post(`/api/deliveries/${deliveryId}/confirm`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ confirmationCode });

      expect(res.status).toBe(409);
    });

    it("rejects confirming a delivery that has not reached IN_TRANSIT yet", async () => {
      const retailer = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider = await createTestUser("RIDER");

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailer.token}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider.user.id });

      const res = await request(app)
        .post(`/api/deliveries/${created.body.id}/confirm`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ confirmationCode: created.body.confirmationCode });

      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /api/deliveries/:id/cancel", () => {
    it("lets a retailer cancel their own OPEN delivery", async () => {
      const { token } = await createTestUser("RETAILER");
      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .send(sampleDeliveryPayload);

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .send({ note: "Customer changed their mind" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("forbids a retailer from cancelling another retailer's delivery", async () => {
      const { token: ownerToken } = await createTestUser("RETAILER", { email: "owner@reflex.test" });
      const { token: otherToken } = await createTestUser("RETAILER", { email: "other@reflex.test" });

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send(sampleDeliveryPayload);

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${otherToken}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it("lets a dispatcher cancel an already-assigned delivery", async () => {
      const retailer = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider = await createTestUser("RIDER");

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailer.token}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider.user.id });

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("lets an assigned rider cancel their own job", async () => {
      const retailer = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider = await createTestUser("RIDER");

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailer.token}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider.user.id });

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("forbids a rider from cancelling a delivery not assigned to them", async () => {
      const retailer = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider = await createTestUser("RIDER");
      const bystanderRider = await createTestUser("RIDER", { email: "bystander@reflex.test" });

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailer.token}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider.user.id });

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${bystanderRider.token}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it("rejects cancelling a delivery that has already been delivered", async () => {
      const retailer = await createTestUser("RETAILER");
      const dispatcher = await createTestUser("DISPATCHER");
      const rider = await createTestUser("RIDER");

      const created = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${retailer.token}`)
        .send(sampleDeliveryPayload);

      await request(app)
        .patch(`/api/deliveries/${created.body.id}/assign`)
        .set("Authorization", `Bearer ${dispatcher.token}`)
        .send({ riderId: rider.user.id });
      await request(app)
        .patch(`/api/deliveries/${created.body.id}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "PICKED_UP" });
      await request(app)
        .patch(`/api/deliveries/${created.body.id}/status`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ status: "IN_TRANSIT" });
      await request(app)
        .post(`/api/deliveries/${created.body.id}/confirm`)
        .set("Authorization", `Bearer ${rider.token}`)
        .send({ confirmationCode: created.body.confirmationCode });

      const res = await request(app)
        .patch(`/api/deliveries/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${retailer.token}`)
        .send({});

      expect(res.status).toBe(409);
    });
  });

  describe("malformed requests do not corrupt state", () => {
    it("returns a clear error and creates nothing on garbage input", async () => {
      const { token } = await createTestUser("RETAILER");

      const res = await request(app)
        .post("/api/deliveries")
        .set("Authorization", `Bearer ${token}`)
        .send({ customerName: 12345, customerPhone: null });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();

      const rows = await db.select().from(deliveries);
      expect(rows.length).toBe(0);
    });
  });
});
