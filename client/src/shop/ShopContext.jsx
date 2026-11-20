import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth.jsx";
import { useApi } from "../useApi.js";

const ShopContext = createContext(null);

const load = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
};

/** Market data, search, and the cart (listing id -> quantity) for merchants and NGOs. */
export function ShopProvider({ children }) {
  const { user } = useAuth();
  const market = useApi("/market");
  const key = `freshloop.cart.${user.id}`;
  const [cart, setCart] = useState(() => load(key));
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(cart)); } catch { /* storage unavailable */ }
  }, [cart, key]);

  // Keep the market fresh while the app is open: prices fall and stock moves.
  const { reload } = market;
  useEffect(() => {
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const listings = useMemo(() => market.data?.listings ?? [], [market.data]);
  const byId = useMemo(() => new Map(listings.map((l) => [l.id, l])), [listings]);

  const setQty = useCallback((id, qty) => {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }, []);
  const clear = useCallback(() => setCart({}), []);

  // Cart lines use live listing data; items that sold out or expired drop away.
  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ listing: byId.get(Number(id)), qty }))
        .filter((x) => x.listing && x.listing.eligible)
        .map((x) => ({ ...x, qty: Math.min(x.qty, x.listing.qtyAvailable) })),
    [cart, byId]
  );
  const count = lines.reduce((s, x) => s + x.qty, 0);
  const total = Math.round(lines.reduce((s, x) => s + x.qty * x.listing.unitPrice, 0) * 100) / 100;
  const mrp = Math.round(lines.reduce((s, x) => s + x.qty * x.listing.basePrice, 0) * 100) / 100;

  const value = {
    ngo: user.role === "ngo",
    market: market.data,
    marketError: market.error,
    reloadMarket: reload,
    listings,
    cart,
    setQty,
    clear,
    lines,
    count,
    total,
    mrp,
    query,
    setQuery,
    cartOpen,
    setCartOpen,
  };
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useShop = () => useContext(ShopContext);
