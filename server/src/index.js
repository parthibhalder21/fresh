import { createApp } from "./app.js";
import { env, loadPolicy } from "./config.js";
import { isEmpty, openDb } from "./db.js";
import { seed } from "./seed.js";

if (env.usingDevSecret) console.warn("[freshloop] JWT_SECRET not set: using an insecure development secret. Set it before deploying.");
const db = openDb(env.dbPath);
if (isEmpty(db)) {
  seed(db);
  console.log("[freshloop] Empty database: loaded demo data.");
}
const policy = loadPolicy();
const app = createApp(db, policy);
app.listen(env.port, () => {
  console.log(`[freshloop] API running on http://localhost:${env.port} (risk policy v${policy.version})`);
});
