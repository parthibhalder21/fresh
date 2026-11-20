import jwt from "jsonwebtoken";
import { env } from "./config.js";
import { HttpError } from "./errors.js";

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, orgId: user.org_id }, env.jwtSecret, { expiresIn: "8h" });
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "Please sign in"));
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, role: payload.role, orgId: payload.orgId };
    next();
  } catch {
    next(new HttpError(401, "Your session has expired. Please sign in again."));
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return next(new HttpError(403, "Your role cannot do this"));
  next();
};
