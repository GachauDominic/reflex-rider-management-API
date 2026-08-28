import request from "supertest";
import { createApp } from "../../src/app";
import { resetDatabase, closeDatabase, createTestUser } from "../testUtils";

const app = createApp();

describe("POST /api/auth/login", () => {
  beforeEach(resetDatabase);
  afterAll(closeDatabase);

  it("logs in with correct credentials", async () => {
    const { user, password } = await createTestUser("RETAILER", {
      email: "sarah@reflex.test",
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("sarah@reflex.test");
    expect(res.body.user.role).toBe("RETAILER");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects an incorrect password", async () => {
    const { user } = await createTestUser("RETAILER", { email: "sarah2@reflex.test" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("rejects an unknown email with the same generic message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@reflex.test", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it("rejects a missing email or password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "no-password@reflex.test" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(resetDatabase);
  afterAll(closeDatabase);

  it("returns the current user for a valid token", async () => {
    const { user, token } = await createTestUser("DISPATCHER", { email: "david@reflex.test" });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.role).toBe("DISPATCHER");
  });

  it("rejects a request with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});
