// The whole FreshLoop API, running inside the browser.
//
// The demo build reuses the real server route handlers (server/src/routes) on top
// of SQLite compiled to WebAssembly (sql.js). Data is kept in this browser's
// local storage, so it survives a page reload.
import initSqlJs from "sql.js/dist/sql-asm.js"; // pure JavaScript: no WebAssembly, so it runs under strict page policies
import policy from "../../../server/config/risk-policy.json";
import { SCHEMA, SCHEMA_VERSION } from "../../../server/src/schema.js";
import { seed } from "../../../server/src/seed.js";
import { errorHandler, HttpError } from "../../../server/src/errors.js";
import { authenticate } from "../../../server/src/auth.js";
import authRoutes from "../../../server/src/routes/auth.js";
import inventoryRoutes from "../../../server/src/routes/inventory.js";
import { listingRoutes } from "../../../server/src/routes/listings.js";
import { marketRoutes, profileRoutes } from "../../../server/src/routes/market.js";
import { buyerOrderRoutes, storeOrderRoutes } from "../../../server/src/routes/orders.js";
import { adminRoutes, dashboardRoutes } from "../../../server/src/routes/admin.js";
import { Router } from "./express-shim.js";

const STORE_KEY = `freshloop.demo.db.v${SCHEMA_VERSION}`;

/** Wrap sql.js so it looks like node:sqlite's DatabaseSync. */
function wrap(raw) {
  const bindable = (args) => {
    if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
      const o = {};
      for (const [k, v] of Object.entries(args[0])) o[/^[@:$]/.test(k) ? k : `@${k}`] = v ?? null;
      return o;
    }
    return args.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  };
  const db = {
    exec: (sql) => raw.exec(sql),
    prepare(sql) {
      const rows = (args) => {
        const st = raw.prepare(sql);
        try {
          st.bind(bindable(args));
          const out = [];
          while (st.step()) out.push(st.getAsObject());
          return out;
        } finally {
          st.free();
        }
      };
      return {
        all: (...args) => rows(args),
        get: (...args) => rows(args)[0],
        run: (...args) => {
          raw.run(sql, bindable(args));
          const changes = raw.getRowsModified();
          const id = raw.exec("SELECT last_insert_rowid() AS id")[0]?.values[0][0] ?? 0;
          return { changes, lastInsertRowid: id };
        },
      };
    },
  };
  db.transaction = (fn) => (...args) => {
    raw.exec("BEGIN");
    try {
      const r = fn(...args);
      raw.exec("COMMIT");
      return r;
    } catch (e) {
      raw.exec("ROLLBACK");
      throw e;
    }
  };
  return db;
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let ready;
function boot() {
  ready ??= (async () => {
    const SQL = await initSqlJs();
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch { /* storage unavailable */ }
    let raw;
    try {
      raw = saved ? new SQL.Database(fromBase64(saved)) : null;
    } catch {
      raw = null;
    }
    const fresh = !raw;
    raw ??= new SQL.Database();
    raw.exec("PRAGMA foreign_keys = ON");
    raw.exec(SCHEMA);
    const db = wrap(raw);
    if (fresh) seed(db);

    const api = Router();
    api.get("/health", (req, res) => res.json({ status: "ok", policyVersion: policy.version, mode: "browser demo" }));
    api.use("/auth", authRoutes(db));
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
    api.use((req, res, next) => next(new HttpError(404, "No such API route")));
    api.use(errorHandler);

    const save = () => {
      try { localStorage.setItem(STORE_KEY, toBase64(raw.export())); } catch { /* storage full or unavailable */ }
    };
    if (fresh) save();
    return { api, save };
  })();
  return ready;
}

/** Same contract as fetch(`/api${path}`): resolves to { status, data }. */
export async function demoRequest(method, path, body, token) {
  const { api, save } = await boot();
  const [p, qs] = path.split("?");
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) {
        if (method !== "GET" && this.statusCode < 400) save();
        resolve({ status: this.statusCode, data: JSON.parse(JSON.stringify(data ?? {})) });
      },
    };
    const req = {
      method,
      path: p,
      params: {},
      query: Object.fromEntries(new URLSearchParams(qs || "")),
      body: body ?? {},
      headers: { authorization: token ? `Bearer ${token}` : "" },
    };
    api.handle(req, res, (err) => resolve({ status: err ? 500 : 404, data: { error: err ? "Something went wrong" : "Not found" } }));
  });
}

/** Wipe this browser's demo data and start again. */
export function resetDemo() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
}
