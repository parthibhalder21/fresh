import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const forbidden = (msg = "You do not have access to this") => new HttpError(403, msg);
export const badRequest = (msg) => new HttpError(400, msg);

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path?.join(".");
    return res.status(400).json({ error: field ? `${field}: ${first.message}` : first?.message || "Invalid input" });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
}
