import request from "supertest";
import { createApp } from "../src/app.js";
import { loadPolicy } from "../src/config.js";
import { openDb } from "../src/db.js";
import { DEMO_PASSWORD, seed } from "../src/seed.js";

/** A fresh in-memory database with demo data, and a logged-in agent per role. */
export async function setup() {
  const db = openDb(":memory:");
  seed(db);
  const policy = loadPolicy();
  const app = createApp(db, policy, { serveClient: false });
  const login = async (email) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: DEMO_PASSWORD });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.body.error}`);
    const token = res.body.token;
    const as = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${token}`);
    return { token, get: (p) => as("get", p), post: (p) => as("post", p), patch: (p) => as("patch", p) };
  };
  return { db, app, policy, login };
}
