import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate, signToken } from "../auth.js";
import { audit } from "../audit.js";
import { HttpError } from "../errors.js";
import { getOrg, publicOrg } from "../services.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

// Only local merchants and NGOs can sign themselves up. Stores and HQ are created by the operator.
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  password: z.string().min(8, "must be at least 8 characters").max(200),
  role: z.enum(["merchant", "ngo"]),
  orgName: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(200),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,20}$/, "is not a valid phone number"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  hasColdStorage: z.boolean().default(false),
});

function userView(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export default function authRoutes(db) {
  const r = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Try again in a few minutes." } });

  r.post("/login", limiter, (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new HttpError(401, "Wrong email or password");
    req.user = { id: user.id, orgId: user.org_id, role: user.role };
    audit(db, req, "auth.login", "user", user.id);
    res.json({ token: signToken(user), user: userView(user), org: publicOrg(getOrg(db, user.org_id)) });
  });

  r.post("/register", limiter, (req, res) => {
    const input = registerSchema.parse(req.body);
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(input.email)) throw new HttpError(409, "An account with this email already exists");
    const create = db.transaction(() => {
      const org = db
        .prepare("INSERT INTO orgs (type, name, address, lat, lng, phone, has_cold_storage, verified) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
        .run(input.role, input.orgName, input.address, input.lat, input.lng, input.phone, input.hasColdStorage ? 1 : 0);
      const user = db
        .prepare("INSERT INTO users (org_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)")
        .run(org.lastInsertRowid, input.name, input.email, bcrypt.hashSync(input.password, 10), input.role);
      return db.prepare("SELECT * FROM users WHERE id = ?").get(user.lastInsertRowid);
    });
    const user = create();
    req.user = { id: user.id, orgId: user.org_id, role: user.role };
    audit(db, req, "auth.register", "org", user.org_id, input.orgName);
    res.status(201).json({ token: signToken(user), user: userView(user), org: publicOrg(getOrg(db, user.org_id)) });
  });

  r.get("/me", authenticate, (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!user) throw new HttpError(401, "Please sign in");
    res.json({ user: userView(user), org: publicOrg(getOrg(db, user.org_id)) });
  });

  return r;
}
