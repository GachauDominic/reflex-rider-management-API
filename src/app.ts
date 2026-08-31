import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import deliveryRoutes from "./routes/deliveries.routes";
import riderRoutes from "./routes/riders.routes";
import eventRoutes from "./routes/events.routes";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./middleware/logger";
import { loginRateLimit } from "./middleware/rateLimit";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE',]
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // routes
  app.use("/api/auth", authRoutes);
  app.use("/api/deliveries", deliveryRoutes);
  app.use("/api/riders", riderRoutes);
  app.use("/api/events", eventRoutes);

  app.use(logger)
  app.use(loginRateLimit)

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  return app;
}
