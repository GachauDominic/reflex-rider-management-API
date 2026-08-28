import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { listRiders, getRiderDeliveries } from "../controllers/riders.controller";

const router = Router();

router.use(authenticate);

router.get("/", authorize("DISPATCHER"), listRiders);
router.get("/:id/deliveries", authorize("DISPATCHER", "RIDER"), getRiderDeliveries);

export default router;
