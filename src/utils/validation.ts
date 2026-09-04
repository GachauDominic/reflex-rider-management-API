// Accepts common Kenyan mobile formats: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
const KENYAN_PHONE_REGEX = /^(?:\+254|254|0)(7|1)\d{8}$/;

export function isValidKenyanPhone(phone: string): boolean {
  return KENYAN_PHONE_REGEX.test(phone.trim());
}

export function isNonEmptyString(value: unknown, maxLength = 500): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPassword(password: unknown): password is string {
  if (typeof password !== "string") return false;
  return password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
