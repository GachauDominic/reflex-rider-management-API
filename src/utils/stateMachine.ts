import { DeliveryStatus } from "../types";

/**
 * Defines which statuses a delivery may move to from its current status.
 * DELIVERED and CANCELLED are terminal — no further transitions allowed.
 */
export const VALID_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  OPEN: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: DeliveryStatus, to: DeliveryStatus) {
    super(`Cannot transition delivery from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(
  from: DeliveryStatus,
  to: DeliveryStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidTransition(
  from: DeliveryStatus,
  to: DeliveryStatus
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminal(status: DeliveryStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}
