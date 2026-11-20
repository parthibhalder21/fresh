import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, tokenStore } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: Boolean(tokenStore.get()), user: null, org: null });

  const logout = useCallback(() => {
    tokenStore.set(null);
    setState({ loading: false, user: null, org: null });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api("/auth/me");
      setState({ loading: false, user: me.user, org: me.org });
    } catch {
      logout();
    }
  }, [logout]);

  // Restore the session on page load.
  useEffect(() => {
    if (!tokenStore.get()) return undefined;
    let live = true;
    api("/auth/me")
      .then((me) => live && setState({ loading: false, user: me.user, org: me.org }))
      .catch(() => {
        if (!live) return;
        tokenStore.set(null);
        setState({ loading: false, user: null, org: null });
      });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener("freshloop:unauthorized", onUnauthorized);
    return () => window.removeEventListener("freshloop:unauthorized", onUnauthorized);
  }, [logout]);

  const signIn = useCallback(async (path, body) => {
    const res = await api(path, { method: "POST", body });
    tokenStore.set(res.token);
    setState({ loading: false, user: res.user, org: res.org });
    return res;
  }, []);

  const value = useMemo(() => ({ ...state, signIn, logout, refresh, setOrg: (org) => setState((s) => ({ ...s, org })) }), [state, signIn, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
