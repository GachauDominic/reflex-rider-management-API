import jwt, { SignOptions } from "jsonwebtoken";
import { AuthTokenPayload } from "../types";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

function getJwtExpiresIn(): SignOptions["expiresIn"] | undefined {
  const expiresIn = process.env.JWT_EXPIRES_IN;
  return expiresIn && expiresIn.trim() ? (expiresIn as SignOptions["expiresIn"]) : undefined;
}

export function signToken(payload: AuthTokenPayload): string {
  const options: SignOptions = {};
  const expiresIn = getJwtExpiresIn();

  if (expiresIn) {
    options.expiresIn = expiresIn;
  }

  return jwt.sign(payload, getJwtSecret(), options);
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
}
