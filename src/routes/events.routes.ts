import { Router, Request, Response } from "express";
import { authenticateFlexible } from "../middleware/auth";
import { deliveryEventBus, RealtimeEvent } from "../utils/eventBus";

const router = Router();

const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * GET /api/events — Server-Sent Events stream of delivery updates.
 * - DISPATCHER receives every event (they need full visibility to dispatch).
 * - RETAILER receives events only for deliveries they created.
 * - RIDER receives events only for deliveries assigned to them.
 */
router.get("/", authenticateFlexible, (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");

  const user = req.user!;

  const isRelevant = (event: RealtimeEvent): boolean => {
    if (user.role === "DISPATCHER") return true;
    if (user.role === "RETAILER") return event.delivery.retailerId === user.sub;
    if (user.role === "RIDER") return event.delivery.riderId === user.sub;
    return false;
  };

  const send = (event: RealtimeEvent) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const unsubscribe = deliveryEventBus.subscribe((event) => {
    if (isRelevant(event)) send(event);
  });

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
  }, HEARTBEAT_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
