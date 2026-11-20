import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ChevronRight, CircleUser, ClipboardList, LogOut, Search, ShoppingCart, TriangleAlert, X } from "lucide-react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { money, money2, n, units } from "../format.js";
import { Logo } from "../components/ui.jsx";
import { useToast } from "../components/toast.jsx";
import { ShopProvider, useShop } from "./ShopContext.jsx";
import { etaFor, Stepper } from "./parts.jsx";
import "./shop.css";
import { art } from "./art.js";

function Header() {
  const { logout } = useAuth();
  const shop = useShop();
  const navigate = useNavigate();
  const f = shop.market?.fulfilment;
  const nearest = shop.listings.length ? Math.min(...shop.listings.map((l) => l.distanceKm)) : null;
  const eta = f && nearest != null ? etaFor(nearest, f) : null;

  return (
    <header className="shop-head">
      <div className="shop-head-in">
        <Link to="/" className="shop-brand" onClick={() => shop.setQuery("")}>
          <Logo size={32} />
          <b>FreshLoop</b>
        </Link>
        <div className="shop-loc">
          <div className="eta">{eta ? `Delivery in ${eta} minutes` : shop.ngo ? "Donations near you" : "Surplus near you"}</div>
          <div className="addr" title={shop.market?.deliverTo}>{shop.market?.deliverTo ?? "…"}</div>
        </div>
        <label className="shop-search">
          <Search size={18} color="var(--muted)" />
          <input
            value={shop.query}
            onChange={(e) => { shop.setQuery(e.target.value); navigate("/"); }}
            placeholder={shop.ngo ? 'Search donations: "rice", "curd", "bread"' : 'Search "milk", "bread", "tomatoes"'}
            aria-label="Search products"
          />
          {shop.query && <button className="icon-btn" onClick={() => shop.setQuery("")} aria-label="Clear search"><X size={16} /></button>}
        </label>
        <nav className="shop-nav">
          <NavLink to="/orders" className="shop-link"><ClipboardList size={18} /><span className="lbl">Orders</span></NavLink>
          <NavLink to="/account" className="shop-link"><CircleUser size={18} /><span className="lbl">Account</span></NavLink>
          <button className="shop-link" onClick={logout} title="Sign out"><LogOut size={18} /></button>
          <button className={`cart-btn ${shop.count ? "" : "is-empty"}`} onClick={() => shop.setCartOpen(true)}>
            <ShoppingCart size={20} />
            {shop.count ? <span className="lines"><span>{shop.count} {shop.count === 1 ? "item" : "items"}</span><span>{shop.ngo ? "Free" : money(shop.total)}</span></span> : <span>My Cart</span>}
          </button>
        </nav>
      </div>
    </header>
  );
}

function CartBar() {
  const shop = useShop();
  if (!shop.count || shop.cartOpen) return null;
  return (
    <button className="cartbar" onClick={() => shop.setCartOpen(true)}>
      <span className="ic"><ShoppingCart size={20} /></span>
      <span className="t">{shop.count} {shop.count === 1 ? "item" : "items"}<small>{shop.ngo ? "Free donation" : money2(shop.total)}</small></span>
      <span className="go">View cart <ChevronRight size={18} /></span>
    </button>
  );
}

function CartDrawer() {
  const shop = useShop();
  const toast = useToast();
  const navigate = useNavigate();
  const [fulfilment, setFulfilment] = useState("delivery");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const f = shop.market?.fulfilment;

  const groups = useMemo(() => {
    const m = new Map();
    for (const line of shop.lines) {
      const s = line.listing.source;
      if (!m.has(s.id)) m.set(s.id, { store: s, distanceKm: line.listing.distanceKm, lines: [] });
      m.get(s.id).lines.push(line);
    }
    return [...m.values()].map((g) => {
      const total = Math.round(g.lines.reduce((t, x) => t + x.qty * x.listing.unitPrice, 0) * 100) / 100;
      const fee = fulfilment === "delivery" && !shop.ngo && f && total < f.freeDeliveryAbove ? f.deliveryFee : 0;
      return { ...g, total, fee, eta: f ? etaFor(g.distanceKm, f) : null };
    });
  }, [shop.lines, shop.ngo, fulfilment, f]);

  if (!shop.cartOpen) return null;
  const fees = groups.reduce((t, g) => t + g.fee, 0);
  const grand = Math.round((shop.total + fees) * 100) / 100;
  const savings = Math.round((shop.mrp - shop.total) * 100) / 100;
  const verified = shop.market?.verified !== false;
  const close = () => shop.setCartOpen(false);

  const place = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api("/orders", { method: "POST", body: { fulfilment, items: shop.lines.map((x) => ({ listingId: x.listing.id, qty: x.qty })) } });
      shop.clear();
      shop.reloadMarket();
      close();
      toast(res.orders.length > 1 ? `${res.orders.length} orders placed, one per store` : "Order placed");
      navigate(res.orders.length > 1 ? "/orders" : `/orders/${res.orders[0].id}`);
    } catch (e) {
      setErr(e.message);
      shop.reloadMarket();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="drawer-bg" onClick={close} />
      <aside className="drawer" role="dialog" aria-label="My cart">
        <div className="drawer-head">
          <h3>My cart</h3>
          <button className="icon-btn" onClick={close} aria-label="Close cart"><X size={20} /></button>
        </div>
        {shop.lines.length === 0 ? (
          <div className="drawer-body">
            <div className="shop-empty">
              <img src={art("/img/cart.svg")} alt="" />
              <h3>Your cart is empty</h3>
              <p>{shop.ngo ? "Claim donations nearby before they expire." : "Add discounted stock from stores near you."}</p>
              <button className="btn primary" style={{ marginTop: 16 }} onClick={close}>Start shopping</button>
            </div>
          </div>
        ) : (
          <>
            <div className="drawer-body">
              {err && <div className="error">{err}</div>}
              {!verified && <div className="notice"><TriangleAlert size={18} /> Your account is waiting for verification by FreshLoop, so you can't order yet.</div>}
              {groups.map((g) => (
                <div className="box" key={g.store.id}>
                  <div className="box-title">
                    <img src={art(fulfilment === "delivery" ? "/img/scooter.svg" : "/img/store.svg")} alt="" />
                    <div>
                      {fulfilment === "delivery" ? `Delivery in ${g.eta} minutes` : "Ready for pickup in 15 minutes"}
                      <small>From {g.store.name} · {g.distanceKm} km · {g.lines.length} {g.lines.length === 1 ? "item" : "items"}</small>
                    </div>
                  </div>
                  {g.lines.map(({ listing: l, qty }) => (
                    <div className="line" key={l.id}>
                      <div className="line-img"><img src={art(l.product.image)} alt="" /></div>
                      <div className="line-info">
                        <div className="line-name">{l.product.name}</div>
                        <div className="line-sub">1 {l.product.unit} · {l.qtyAvailable} {units(l.product.unit, l.qtyAvailable)} left</div>
                      </div>
                      <Stepper listing={l} compact />
                      <div className="line-price" style={{ minWidth: 58 }}>{shop.ngo ? "Free" : money2(Math.round(qty * l.unitPrice * 100) / 100)}{!shop.ngo && <s>{money2(qty * l.basePrice)}</s>}</div>
                    </div>
                  ))}
                </div>
              ))}
              {groups.length > 1 && <div className="note">Your cart has items from {groups.length} stores, so it will come as {groups.length} separate orders.</div>}

              <div className="box">
                <div className="box-title">How do you want it?</div>
                <div className="ful">
                  <button className={fulfilment === "delivery" ? "on" : ""} onClick={() => setFulfilment("delivery")}>
                    <img src={art("/img/scooter.svg")} alt="" />
                    <div><b>Delivery</b><span>{groups[0]?.eta ? `${Math.min(...groups.map((g) => g.eta))}–${Math.max(...groups.map((g) => g.eta)) + 5} min` : ""}</span></div>
                  </button>
                  <button className={fulfilment === "pickup" ? "on" : ""} onClick={() => setFulfilment("pickup")}>
                    <img src={art("/img/store.svg")} alt="" />
                    <div><b>Pickup</b><span>Collect from store</span></div>
                  </button>
                </div>
                {fulfilment === "delivery" && <div className="line-sub" style={{ marginTop: 10 }}>Delivering to {shop.market?.deliverTo}</div>}
              </div>

              <div className="box">
                <div className="box-title">Bill details</div>
                <div className="bill-row"><span>Items total</span><span>{!shop.ngo && <s>{money2(shop.mrp)}</s>}{shop.ngo ? "Free" : money2(shop.total)}</span></div>
                <div className="bill-row"><span>Delivery charge</span><span>{fees ? money2(fees) : <span className="tag-free">FREE</span>}</span></div>
                {!shop.ngo && f && fulfilment === "delivery" && fees > 0 && <div className="line-sub">Free delivery on orders above {money(f.freeDeliveryAbove)} from a store</div>}
                <div className="bill-row total"><span>Grand total</span><span>{shop.ngo ? "Free" : money2(grand)}</span></div>
                {!shop.ngo && savings > 0 && <div className="bill-row"><span className="save">Your total savings</span><span className="save">{money2(savings)}</span></div>}
              </div>
              <div className="saved"><img src={art("/img/seedling.svg")} alt="" /> This order keeps {n(shop.count)} {shop.count === 1 ? "item" : "items"} of food out of the bin.</div>
            </div>
            <div className="drawer-foot">
              <button className="place" disabled={busy || !verified} onClick={place}>
                <span>{shop.ngo ? "Free" : money2(grand)}<small>TOTAL</small></span>
                <span>{busy ? "Placing order…" : shop.ngo ? "Claim donation" : "Place order"} <ChevronRight size={18} style={{ verticalAlign: -4 }} /></span>
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

export default function ShopLayout() {
  return (
    <ShopProvider>
      <div className="shop">
        <Header />
        <main className="shop-main">
          <Outlet />
        </main>
        <CartBar />
        <CartDrawer />
      </div>
    </ShopProvider>
  );
}
