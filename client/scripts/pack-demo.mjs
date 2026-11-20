// Packs the demo build into ONE html file that opens by double-click, with no server.
// Usage: npm run build:demo -w client && node client/scripts/pack-demo.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist-demo");
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, href) => `<style>${fs.readFileSync(path.join(dist, href), "utf8")}</style>`);
html = html.replace(/<script type="module" crossorigin src="\.?\/?([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(dist, src), "utf8").replace(/<\/script/gi, "<\\/script");
  return `<script type="module">${js}</script>`;
});
const icon = fs.readFileSync(path.join(dist, "favicon.svg"));
html = html.replace(/href="\.?\/?favicon\.svg"/, `href="data:image/svg+xml;base64,${icon.toString("base64")}"`);

const out = path.resolve(root, "..", "index.html");
fs.writeFileSync(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);
