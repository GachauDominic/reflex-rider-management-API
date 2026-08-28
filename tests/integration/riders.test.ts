import request from "supertest";
import { createApp } from "../../src/app";
import { resetDatabase, closeDatabase, createTestUser } from "../testUtils";

const app = createApp();

describe("GET /api/riders", () => {
  beforeEach(resetDatabase);
  afterAll(closeDatabase);

  it("lets a dispatcher list all riders", async () => {
    const { token: dispatcherToken } = await createTestUser("DISPATCHER");
    await createTestUser("RIDER", { email: "r1@reflex.test" });
    await createTestUser("RIDER", { email: "r2@reflex.test" });

    const res = await request(app).get("/api/riders").set("Authorization", `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it("forbids a retailer from listing riders", async () => {
    const { token } = await createTestUser("RETAILER");
    const res = await request(app).get("/api/riders").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("forbids a rider from listing riders", async () => {
    const { token } = await createTestUser("RIDER");
    const res = await request(app).get("/api/riders").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/riders/:id/deliveries", () => {
  beforeEach(resetDatabase);
  afterAll(closeDatabase);

  it("lets a rider view their own delivery list", async () => {
    const { user: rider, token: riderToken } = await createTestUser("RIDER");

    const res = await request(app)
      .get(`/api/riders/${rider.id}/deliveries`)
      .set("Authorization", `Bearer ${riderToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("forbids a rider from viewing another rider's delivery list", async () => {
    const { token: riderAToken } = await createTestUser("RIDER", { email: "a@reflex.test" });
    const { user: riderB } = await createTestUser("RIDER", { email: "b@reflex.test" });

    const res = await request(app)
      .get(`/api/riders/${riderB.id}/deliveries`)
      .set("Authorization", `Bearer ${riderAToken}`);

    expect(res.status).toBe(403);
  });

  it("lets a dispatcher view any rider's delivery list", async () => {
    const { token: dispatcherToken } = await createTestUser("DISPATCHER");
    const { user: rider } = await createTestUser("RIDER");

    const res = await request(app)
      .get(`/api/riders/${rider.id}/deliveries`)
      .set("Authorization", `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(200);
  });

  it("returns 404 for a rider id that does not exist", async () => {
    const { token: dispatcherToken } = await createTestUser("DISPATCHER");
    const res = await request(app)
      .get("/api/riders/00000000-0000-0000-0000-000000000000/deliveries")
      .set("Authorization", `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(404);
  });
});
