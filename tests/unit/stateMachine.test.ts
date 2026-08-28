import {
  canTransition,
  assertValidTransition,
  InvalidTransitionError,
  isTerminal,
} from "../../src/utils/stateMachine";

describe("delivery state machine", () => {
  it("allows the normal happy-path sequence", () => {
    expect(canTransition("OPEN", "ASSIGNED")).toBe(true);
    expect(canTransition("ASSIGNED", "PICKED_UP")).toBe(true);
    expect(canTransition("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransition("IN_TRANSIT", "DELIVERED")).toBe(true);
  });

  it("allows cancellation from any non-terminal state", () => {
    expect(canTransition("OPEN", "CANCELLED")).toBe(true);
    expect(canTransition("ASSIGNED", "CANCELLED")).toBe(true);
    expect(canTransition("PICKED_UP", "CANCELLED")).toBe(true);
    expect(canTransition("IN_TRANSIT", "CANCELLED")).toBe(true);
  });

  it("rejects skipping straight from OPEN to DELIVERED", () => {
    expect(canTransition("OPEN", "DELIVERED")).toBe(false);
    expect(() => assertValidTransition("OPEN", "DELIVERED")).toThrow(
      InvalidTransitionError
    );
  });

  it("rejects moving backwards", () => {
    expect(canTransition("IN_TRANSIT", "PICKED_UP")).toBe(false);
    expect(canTransition("DELIVERED", "IN_TRANSIT")).toBe(false);
  });

  it("treats DELIVERED and CANCELLED as terminal", () => {
    expect(isTerminal("DELIVERED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("OPEN")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "OPEN")).toBe(false);
  });
});
