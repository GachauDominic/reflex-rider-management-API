import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { listAllRiders, getRiderDeliveries as getRiderDeliveriesService } from "../services/rider.service";

// Controllers only handle HTTP concerns (read the request, call the
// service, shape the response) — all business logic lives in
// ../services/rider.service.ts.

export const listRiders = asyncHandler(async (_req: Request, res: Response) => {
  const riders = await listAllRiders();
  res.json(riders);
});

export const getRiderDeliveries = asyncHandler(async (req: Request, res: Response) => {
  const riderDeliveries = await getRiderDeliveriesService(req.user!, req.params.id);
  res.json(riderDeliveries);
});
