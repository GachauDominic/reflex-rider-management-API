import { Router } from "express";
import { login, me } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { loginRateLimit } from "../middleware/rateLimit";

const router = Router();

router.post("/login", loginRateLimit, login);
router.get("/me", authenticate, me);

export default router;
