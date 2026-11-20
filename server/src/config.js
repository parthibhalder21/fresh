import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, "..");

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  dbPath: process.env.DB_PATH || path.join(SERVER_ROOT, "data", "freshloop.db"),
  jwtSecret: process.env.JWT_SECRET || "",
  clientDist: process.env.CLIENT_DIST || path.resolve(SERVER_ROOT, "..", "client", "dist"),
};

if (!env.jwtSecret) {
  if (env.nodeEnv === "production") {
    throw new Error("JWT_SECRET must be set in production. See .env.example.");
  }
  env.jwtSecret = "dev-only-secret-change-me";
  env.usingDevSecret = true;
}

export function loadPolicy(file = path.join(SERVER_ROOT, "config", "risk-policy.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
