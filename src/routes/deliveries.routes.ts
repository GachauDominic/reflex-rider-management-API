import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import {
  createDelivery,
  listDeliveries,
  getDelivery,
  assignDelivery,
  updateDeliveryStatus,
  cancelDelivery,
  confirmDelivery,
} from "../controllers/deliveries.controller";

const router = Router();

router.use(authenticate);

router.post("/", authorize("RETAILER"), createDelivery);
router.get("/", listDeliveries); // filtered by role inside the controller
router.get("/:id", getDelivery); // access checked inside the controller
router.patch("/:id/assign", authorize("DISPATCHER"), assignDelivery);
router.patch("/:id/status", authorize("RIDER"), updateDeliveryStatus);
router.patch("/:id/cancel", authorize("RETAILER", "DISPATCHER", "RIDER"), cancelDelivery);
router.post("/:id/confirm", authorize("RIDER"), confirmDelivery);

export default router;
