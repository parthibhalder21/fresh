import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { authenticate } from "./auth.js";
import { env } from "./config.js";
import { errorHandler, HttpError } from "./errors.js";
import authRoutes from "./routes/auth.js";
import inventoryRoutes from "./routes/inventory.js";
import { listingRoutes } from "./routes/listings.js";
import { marketRoutes, profileRoutes } from "./routes/market.js";
import { buyerOrderRoutes, storeOrderRoutes } from "./routes/orders.js";
import { adminRoutes, dashboardRoutes } from "./routes/admin.js";

export function createApp(db, policy, { serveClient = true } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: "draft-8", legacyHeaders: false }));

  app.get("/api/health", (req, res) => res.json({ status: "ok", policyVersion: policy.version }));
  app.use("/api/auth", authRoutes(db));

  const api = express.Router();
  api.use(authenticate);
  api.get("/policy", (req, res) => res.json(policy));
  api.get("/products", (req, res) => res.json({ products: db.prepare("SELECT id, sku, name, category, unit, image, base_price AS basePrice, requires_cold AS requiresCold FROM products ORDER BY category, name").all() }));
  api.use("/inventory", inventoryRoutes(db, policy));
  api.use("/listings", listingRoutes(db, policy));
  api.use("/market", marketRoutes(db, policy));
  api.use("/orders", buyerOrderRoutes(db, policy));
  api.use("/store-orders", storeOrderRoutes(db));
  api.use("/me", profileRoutes(db));
  api.use("/dashboard", dashboardRoutes(db, policy));
  api.use("/admin", adminRoutes(db));
  app.use("/api", api);
  app.use("/api", (req, res, next) => next(new HttpError(404, "No such API route")));

  // In production the API also serves the built React app.
  const indexHtml = path.join(env.clientDist, "index.html");
  if (serveClient && fs.existsSync(indexHtml)) {
    app.use(express.static(env.clientDist, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => (req.method === "GET" || req.method === "HEAD" ? res.sendFile(indexHtml) : next()));
  }

  app.use(errorHandler);
  return app;
}
