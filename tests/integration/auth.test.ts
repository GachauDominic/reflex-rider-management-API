// Env vars set before the imports below so modules that read them at
// load time (jwt.ts, rateLimit.ts) pick up test-safe values regardless
// of whatever is in the developer's local .env — see the JWT_EXPIRES_IN
// discussion: an invalid value there breaks token signing, so these
// tests are hermetic and don't depend on .env at all.
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = "12h";
process.env.LOGIN_RATE_LIMIT_POINTS = "3";
process.env.LOGIN_RATE_LIMIT_DURATION_SECONDS = "60";

// Manual mock (src/db/__mocks__/index.ts) — the real Postgres connection
// is never constructed, so DATABASE_URL doesn't need to be set either.
jest.mock("../../src/db");
// Auto-mocked: every exported function becomes a jest.fn() we configure
// per test. Only routing + middleware (authenticate, loginRateLimit,
// errorHandler) run for real.
jest.mock("../../src/controllers/auth.controller");

import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../../src/app";
import * as authController from "../../src/controllers/auth.controller";
import { AppError } from "../../src/middleware/errorHandler";
import { fakeController, mockActor, mockUserRow, authHeaderFor } from "../testUtils";

const app = createApp();

/**
 * SCOPE: these tests verify route wiring, authenticate()/loginRateLimit
 * middleware, and errorHandler's status-code mapping — using the REAL
 * middleware chain. The login/me business logic itself (credential
 * checking, password hashing) is faked via the mocked controller, so
 * this suite does not exercise auth.service.ts at all. That logic would
 * need its own unit tests against the service directly.
 */
describe("auth routes (mocked db + controllers; real middleware)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/login", () => {
    it("has no auth requirement and passes the response straight through from the controller", async () => {
      const fakeResult = {
        token: "signed.jwt.token",
        user: { id: randomUUID(), name: "Test Retailer", email: "r@reflex.test", role: "RETAILER" },
      };
      (authController.login as jest.Mock).mockImplementation(
        fakeController((_req, res) => res.json(fakeResult))
      );

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "r@reflex.test", password: "Password123!" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fakeResult);
      expect(authController.login).toHaveBeenCalledTimes(1);
    });

    it("propagates a thrown AppError from the controller through the real errorHandler", async () => {
      (authController.login as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new AppError("Invalid email or password", 401);
        })
      );

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@reflex.test", password: "wrong" });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Invalid email or password" });
    });

    it("maps an unexpected thrown error to a generic 500 (never leaks internals)", async () => {
      (authController.login as jest.Mock).mockImplementation(
        fakeController(() => {
          throw new Error("connection refused at 10.0.0.4:5432");
        })
      );

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "x@reflex.test", password: "x" });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Internal server error" });
    });

    it("rate-limits repeated attempts from the same IP + email (real loginRateLimit middleware)", async () => {
      (authController.login as jest.Mock).mockImplementation(
        fakeController((_req, res) => res.status(401).json({ error: "Invalid email or password" }))
      );

      const email = "bruteforce@reflex.test";
      const limit = Number(process.env.LOGIN_RATE_LIMIT_POINTS);

      for (let i = 0; i < limit; i++) {
        const res = await request(app).post("/api/auth/login").send({ email, password: "wrong" });
        expect(res.status).toBe(401);
      }

      // One more attempt beyond the configured allowance should be throttled
      // before it ever reaches the controller.
      const blocked = await request(app).post("/api/auth/login").send({ email, password: "wrong" });
      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({ error: "Too many login attempts. Try again shortly." });
      expect(authController.login).toHaveBeenCalledTimes(limit);
    });
  });

  describe("GET /api/auth/me", () => {
    it("rejects a request with no Authorization header (401, controller never reached)", async () => {
      const res = await request(app).get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Missing or malformed Authorization header" });
      expect(authController.me).not.toHaveBeenCalled();
    });

    it("rejects a malformed/invalid token (401, controller never reached)", async () => {
      const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Invalid or expired token" });
      expect(authController.me).not.toHaveBeenCalled();
    });

    it("accepts a validly signed token, decodes it onto req.user, and passes through the controller response", async () => {
      const actor = mockActor("DISPATCHER");
      const fakeProfile = mockUserRow("DISPATCHER", { id: actor.sub, email: actor.email });

      // Captured outside the handler rather than asserted inside it —
      // an assertion failure inside an Express handler would be caught
      // by asyncHandler and turned into a 500 response instead of
      // failing this test directly.
      let capturedUser: unknown = null;

      (authController.me as jest.Mock).mockImplementation(
        fakeController((req, res) => {
          capturedUser = req.user;
          res.json({ id: fakeProfile.id, name: fakeProfile.name, email: fakeProfile.email, role: fakeProfile.role });
        })
      );

      const res = await request(app).get("/api/auth/me").set(authHeaderFor(actor));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: fakeProfile.id,
        name: fakeProfile.name,
        email: fakeProfile.email,
        role: fakeProfile.role,
      });
      expect(capturedUser).toMatchObject({ sub: actor.sub, role: actor.role, email: actor.email });
      expect(authController.me).toHaveBeenCalledTimes(1);
    });
  });
});
