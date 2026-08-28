import {
  generateConfirmationCode,
  isWellFormedConfirmationCode,
} from "../../src/utils/confirmationCode";

describe("confirmation code", () => {
  it("generates a well-formed code", () => {
    const code = generateConfirmationCode();
    expect(isWellFormedConfirmationCode(code)).toBe(true);
    expect(code.startsWith("REF-DEL-")).toBe(true);
  });

  it("generates unique codes across many calls", () => {
    const codes = new Set(Array.from({ length: 500 }, generateConfirmationCode));
    expect(codes.size).toBe(500);
  });

  it("rejects malformed codes", () => {
    expect(isWellFormedConfirmationCode("not-a-code")).toBe(false);
    expect(isWellFormedConfirmationCode("REF-DEL-123")).toBe(false);
    expect(isWellFormedConfirmationCode("")).toBe(false);
  });
});
