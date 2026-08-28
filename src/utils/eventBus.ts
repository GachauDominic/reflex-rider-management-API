import { EventEmitter } from "events";
import { Delivery } from "../db/schema";

export type DeliveryEventType =
  | "DELIVERY_CREATED"
  | "DELIVERY_ASSIGNED"
  | "DELIVERY_STATUS_UPDATED"
  | "DELIVERY_DELIVERED"
  | "DELIVERY_CANCELLED";

export interface RealtimeEvent {
  type: DeliveryEventType;
  delivery: Delivery;
  timestamp: string;
}

// A single process-wide emitter is sufficient for the MVP (single instance
// deployment). A multi-instance deployment would swap this for a Postgres
// LISTEN/NOTIFY channel or a small pub/sub service, without changing the
// public publish()/subscribe() interface below.
class DeliveryEventBus extends EventEmitter {
  publish(event: Omit<RealtimeEvent, "timestamp">) {
    const fullEvent: RealtimeEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.emit("delivery-event", fullEvent);
  }

  subscribe(listener: (event: RealtimeEvent) => void) {
    this.on("delivery-event", listener);
    return () => this.off("delivery-event", listener);
  }
}

export const deliveryEventBus = new DeliveryEventBus();
deliveryEventBus.setMaxListeners(0); // unlimited SSE subscribers
