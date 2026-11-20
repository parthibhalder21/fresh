// A tiny stand-in for Express's Router, so the real server routes run in the browser demo.
function compile(path) {
  const keys = [];
  const src = path === "/" ? "" : path.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return "/([^/]+)"; });
  return { keys, re: new RegExp(`^${src}(?=/|$)`), exact: new RegExp(`^${src}/?$`) };
}

export function Router() {
  const stack = [];
  const router = (req, res, next) => router.handle(req, res, next);
  router.use = (...args) => {
    const path = typeof args[0] === "string" ? args.shift() : "/";
    for (const fn of args) stack.push({ ...compile(path), prefix: true, fn });
    return router;
  };
  for (const m of ["get", "post", "patch", "put", "delete"]) {
    router[m] = (path, ...fns) => {
      for (const fn of fns) stack.push({ ...compile(path), method: m.toUpperCase(), fn });
      return router;
    };
  }
  router.handle = (req, res, done) => {
    const base = req.path;
    let i = 0;
    const next = (err) => {
      req.path = base;
      while (i < stack.length) {
        const layer = stack[i++];
        if (layer.method && layer.method !== req.method) continue;
        const m = (layer.prefix ? layer.re : layer.exact).exec(base);
        if (!m) continue;
        layer.keys.forEach((k, j) => { req.params[k] = decodeURIComponent(m[j + 1]); });
        const isErrorHandler = layer.fn.length === 4;
        if (err && !isErrorHandler) continue;
        if (!err && isErrorHandler) continue;
        if (layer.prefix) req.path = base.slice(m[0].length) || "/";
        try {
          return err ? layer.fn(err, req, res, next) : layer.fn(req, res, next);
        } catch (e) {
          return next(e);
        }
      }
      done(err);
    };
    next();
  };
  return router;
}

export default { Router };
