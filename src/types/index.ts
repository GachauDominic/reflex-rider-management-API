export type UserRole = "RETAILER" | "DISPATCHER" | "RIDER";

export type DeliveryStatus =
  | "OPEN"
  | "ASSIGNED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

export interface AuthTokenPayload {
  sub: string; // user id
  role: UserRole;
  email: string;
  exp: number;
}

// Augment Express's Request type so req.user is available after auth middleware
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}
