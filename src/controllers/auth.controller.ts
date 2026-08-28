import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loginUser, getCurrentUser } from "../services/auth.service";

// Controllers only handle HTTP concerns (read the request, call the
// service, shape the response) — all business logic lives in
// ../services/auth.service.ts.

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  const result = await loginUser(email, password);
  res.json(result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await getCurrentUser(req.user!.sub);
  res.json(user);
});
