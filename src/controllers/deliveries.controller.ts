import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createDelivery as createDeliveryService,
  listDeliveriesForActor,
  getDeliveryForActor,
  assignDelivery as assignDeliveryService,
  cancelDelivery as cancelDeliveryService,
  updateDeliveryStatus as updateDeliveryStatusService,
  confirmDelivery as confirmDeliveryService,
} from "../services/delivery.service";

// Controllers only handle HTTP concerns (read the request, call the
// service, shape the response) — all business logic, validation, and
// database access lives in ../services/delivery.service.ts.

// ---------- POST /api/deliveries ----------
export const createDelivery = asyncHandler(async (req: Request, res: Response) => {
  const created = await createDeliveryService(req.user!.sub, req.body ?? {});
  res.status(201).json(created);
});

// ---------- GET /api/deliveries ----------
export const listDeliveries = asyncHandler(async (req: Request, res: Response) => {
  const rows = await listDeliveriesForActor(req.user!, req.query.status);
  res.json(rows);
});

// ---------- GET /api/deliveries/:id ----------
export const getDelivery = asyncHandler(async (req: Request, res: Response) => {
  const result = await getDeliveryForActor(req.user!, req.params.id);
  res.json(result);
});

// ---------- PATCH /api/deliveries/:id/assign ----------
export const assignDelivery = asyncHandler(async (req: Request, res: Response) => {
  const { riderId } = req.body ?? {};
  const updated = await assignDeliveryService(req.user!.sub, req.params.id, riderId);
  res.json(updated);
});

// ---------- PATCH /api/deliveries/:id/cancel ----------
export const cancelDelivery = asyncHandler(async (req: Request, res: Response) => {
  const { note } = req.body ?? {};
  const updated = await cancelDeliveryService(req.user!, req.params.id, note);
  res.json(updated);
});

// ---------- PATCH /api/deliveries/:id/status ----------
export const updateDeliveryStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, note } = req.body ?? {};
  const updated = await updateDeliveryStatusService(req.user!, req.params.id, status, note);
  res.json(updated);
});

// ---------- POST /api/deliveries/:id/confirm ----------
export const confirmDelivery = asyncHandler(async (req: Request, res: Response) => {
  const { confirmationCode } = req.body ?? {};
  const updated = await confirmDeliveryService(req.user!.sub, req.params.id, confirmationCode);
  res.json(updated);
});
