import { Router } from "express";
import { login, me, register } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { loginRateLimit } from "../middleware/rateLimit";

const router = Router();

router.post("/register", register)
router.post("/login", loginRateLimit, login);
router.get("/me", authenticate, me);

export default router;
