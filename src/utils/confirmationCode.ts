import crypto from "crypto";

/**
 * Generates a unique, human-readable confirmation code that gets encoded
 * into a QR code shown at delivery time, e.g. "REF-DEL-A1B2C3-X8K2".
 * The code itself is not a security boundary — the backend independently
 * re-validates delivery id, rider identity, and current status before
 * accepting a confirmation (see deliveries.controller.ts `confirmDelivery`).
 */
export function generateConfirmationCode(): string {
  const segment = crypto.randomBytes(4).toString("hex").toUpperCase();
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `REF-DEL-${segment}-${suffix}`;
}

export function isWellFormedConfirmationCode(code: string): boolean {
  return /^REF-DEL-[A-F0-9]{8}-[A-F0-9]{4}$/.test(code);
}
