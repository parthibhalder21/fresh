#!/usr/bin/env node
// `npm run seed`: wipe the database file and load fresh demo data.
import fs from "node:fs";
import { env } from "../src/config.js";
import { openDb } from "../src/db.js";
import { DEMO_PASSWORD, seed } from "../src/seed.js";

for (const f of [env.dbPath, `${env.dbPath}-wal`, `${env.dbPath}-shm`]) fs.rmSync(f, { force: true });
const db = openDb(env.dbPath);
seed(db);
console.log(`[freshloop] Seeded demo data into ${env.dbPath}. Password for every demo account: ${DEMO_PASSWORD}`);
