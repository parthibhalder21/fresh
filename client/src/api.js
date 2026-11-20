const TOKEN_KEY = "freshloop.token";

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// The demo build (npm run build:demo) runs the whole backend inside the browser.
const DEMO = import.meta.env.VITE_DEMO === "1";

export async function api(path, { method = "GET", body } = {}) {
  const token = tokenStore.get();
  if (DEMO) {
    const { demoRequest } = await import("./demo/backend.js");
    const { status, data } = await demoRequest(method, path, body, token);
    if (status >= 400) {
      if (status === 401 && token) window.dispatchEvent(new Event("freshloop:unauthorized"));
      throw new ApiError(status, data.error || `Request failed (${status})`);
    }
    return data;
  }
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event("freshloop:unauthorized"));
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return data;
}
