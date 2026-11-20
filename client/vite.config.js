import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  // `npm run build:demo` builds a version with the whole backend inside the browser,
  // for static hosting (GitHub Pages). It reuses the real server routes.
  const demo = mode === "demo";
  return {
    plugins: [react()],
    base: demo ? "./" : "/",
    define: demo ? { "import.meta.env.VITE_DEMO": JSON.stringify("1") } : {},
    resolve: {
      alias: demo
        ? [
            { find: /^express$/, replacement: here("./src/demo/express-shim.js") },
            { find: /^express-rate-limit$/, replacement: here("./src/demo/noop.js") },
            { find: /^\.\.\/auth\.js$/, replacement: here("./src/demo/auth-shim.js") },
            { find: /^.*server\/src\/auth\.js$/, replacement: here("./src/demo/auth-shim.js") },
          ]
        : [],
    },
    build: {
      outDir: demo ? "dist-demo" : "dist",
      chunkSizeWarningLimit: 3000,
      // One script file in the demo, so it can also be packed into a single HTML page.
      rollupOptions: demo ? { output: { inlineDynamicImports: true } } : {},
    },
    server: {
      port: 5173,
      proxy: { "/api": "http://localhost:4000" },
    },
  };
});
