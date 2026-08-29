process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "12h";

jest.mock("../../src/db");
jest.mock("../../src/controllers/riders.controller");

import request from "supertest";
import { createApp } from "../../src/app";
import * as ridersController from "../../src/controllers/riders.controller";
import { AppError } from "../../src/middleware/errorHandler";
import { UserRole } from "../../src/types";
import { fakeController, mockActor, mockUserRow, mockDeliveryRow, authHeaderFor } from "../testUtils";

const app = createApp();

// SCOPE: same as deliveries.test.ts — real authenticate()/authorize()/
// errorHandler, faked riders.controller.ts, so riders.service.ts's own
// permission logic (e.g. "a rider may only view their own deliveries")
// is not exercised here, only the route-level authorize() gate.
describe("rider routes (mocked db + controllers; real middleware)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/riders (authorize: DISPATCHER only)", () => {
    it("DISPATCHER reaches the controller and gets its response back untouched", async () => {
      const actor = mockActor("DISPATCHER");
      const riders = [mockUserRow("RIDER"), mockUserRow("RIDER")];

      (ridersController.listRiders as jest.Mock).mockImplementation(
        fakeController((_req, res) => res.json(riders))
      );

      const res = await request(app).get("/api/riders").set(authHeaderFor(actor));

      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(riders)));
      expect(ridersController.listRiders).toHaveBeenCalledTimes(1);
    });

    it.each<UserRole>(["RETAILER", "RIDER"])("%s is forbidden (403), controller never reached", async (role) => {
      const actor = mockActor(role);
      const res = await request(app).get("/api/riders").set(authHeaderFor(actor));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: `Role '${role}' is not permitted to perform this action` });
      expect(ridersController.listRiders).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated request before reaching authorize() or the controller", async () => {
      const res = await request(app).get("/api/riders");
      expect(res.status).toBe(401);
      expect(ridersController.listRiders).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/riders/:id/deliveries (authorize: DISPATCHER, RIDER)", () => {
    it.each<UserRole>(["DISPATCHER", "RIDER"])("%s reaches the controller", async (role) => {
      const actor = mockActor(role);
      const deliveries = [mockDeliveryRow({ riderId: actor.sub })];
      let capturedId: unknown = null;

      (ridersController.getRiderDeliveries as jest.Mock).mockImplementation(
        fakeController((req, res) => {
          capturedId = req.params.id;
          res.json(deliveries);
        })
      );

      const res = await request(app)
        .get(`/api/riders/${actor.sub}/deliveries`)
        .set(authHeaderFor(actor));

      expect(res.status).toBe(200);
      expect(res.body).toEqual(JSON.parse(JSON.stringify(deliveries)));
      expect(capturedId).toBe(actor.sub);
    });

    it("RETAILER is forbidden (403), controller never reached", async () => {
      const actor = mockActor("RETAILER");
      const res = await request(app)
        .get("/api/riders/some-rider-id/deliveries")
        .set(authHeaderFor(actor));

      expect(res.status).toBe(403);
      expect(ridersController.getRiderDeliveries).not.toHaveBeenCalled();
    });

    it("propagates a thrown AppError (e.g. rider viewing another rider's list) through the real errorHandler", async () => {
      const actor = mockActor("RIDER");

      (ridersController.getRiderDeliveries as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new AppError("Riders can only view their own deliveries", 403);
        })
      );

      const res = await request(app)
        .get("/api/riders/someone-elses-id/deliveries")
        .set(authHeaderFor(actor));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Riders can only view their own deliveries" });
    });
  });
});
