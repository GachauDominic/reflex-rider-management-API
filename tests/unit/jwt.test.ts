process.env.JWT_SECRET = "test-secret";

import { signToken, verifyToken } from "../../src/utils/jwt";

describe("jwt utils", () => {
  it("round-trips a payload through sign and verify", () => {
    const payload = { sub: "user-1", role: "DISPATCHER" as const, email: "d@reflex.demo" };
    const token = signToken(payload);
    const decoded = verifyToken(token);

    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.email).toBe(payload.email);
  });

  it("throws on a tampered token", () => {
    const token = signToken({ sub: "user-1", role: "RIDER", email: "r@reflex.demo" });
    const tampered = token.slice(0, -2) + "xx";
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("throws on a token signed with a different secret", () => {
    const jwt = require("jsonwebtoken");
    const foreignToken = jwt.sign({ sub: "x", role: "RIDER", email: "x@reflex.demo" }, "other-secret");
    expect(() => verifyToken(foreignToken)).toThrow();
  });
});
