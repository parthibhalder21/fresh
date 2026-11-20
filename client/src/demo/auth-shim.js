// Browser stand-in for server/src/auth.js. Same roles and checks; the token is a
// simple encoded payload because there is no server secret in a static demo.
import { HttpError } from "../../../server/src/errors.js";

export function signToken(user) {
  return btoa(JSON.stringify({ sub: user.id, role: user.role, orgId: user.org_id, exp: Date.now() + 8 * 3600_000 }));
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "Please sign in"));
  try {
    const p = JSON.parse(atob(token));
    if (p.exp < Date.now()) throw new Error("expired");
    req.user = { id: p.sub, role: p.role, orgId: p.orgId };
    next();
  } catch {
    next(new HttpError(401, "Your session has expired. Please sign in again."));
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return next(new HttpError(403, "Your role cannot do this"));
  next();
};
