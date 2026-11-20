// Uses the SQLite engine built into Node.js (node:sqlite), so there is nothing
// native to compile on install, on Windows, macOS or Linux.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

import { SCHEMA, SCHEMA_VERSION } from "./schema.js";

export { SCHEMA_VERSION };

export function openDb(file = ":memory:") {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  // A database from an older version of the app is rebuilt with fresh demo data.
  const version = db.prepare("PRAGMA user_version").get().user_version;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  if (version < SCHEMA_VERSION && tables.length) {
    console.warn("[freshloop] Database is from an older version: rebuilding it with fresh demo data.");
    db.exec("PRAGMA foreign_keys = OFF");
    for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  }
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  /** Wrap fn so it runs atomically: all of its writes commit, or none do. */
  db.transaction = (fn) => (...args) => {
    db.exec("BEGIN");
    try {
      const result = fn(...args);
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };
  return db;
}

export function isEmpty(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM orgs").get().n === 0;
}
