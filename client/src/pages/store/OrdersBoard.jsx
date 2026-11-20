import { useEffect, useState } from "react";
import { Bike, Clock, MapPin, Phone, Store } from "lucide-react";
import { api } from "../../api.js";
import { useApi } from "../../useApi.js";
import { useToast } from "../../components/toast.jsx";
import { clock, money2, n } from "../../format.js";
import { Empty, ErrorBox, Kpi, Loading, Page } from "../../components/ui.jsx";
import { StatusBadge } from "../../shop/Orders.jsx";
import { art } from "../../shop/art.js";

const COLUMNS = [
  ["New", (o) => o.status === "placed"],
  ["Packed", (o) => o.status === "packed"],
  ["On the way / at counter", (o) => o.status === "out_for_delivery" || o.status === "ready_for_pickup"],
  ["Done", (o) => ["completed", "cancelled", "no_show"].includes(o.status)],
];

function nextAction(o) {
  if (o.status === "placed") return "Mark packed";
  if (o.status === "packed") return o.fulfilment === "delivery" ? "Hand to rider" : "Ready at counter";
  if (o.status === "out_for_delivery") return "Mark delivered";
  if (o.status === "ready_for_pickup") return "Mark collected";
  return null;
}

function due(o) {
  const mins = Math.round((new Date(o.dueBy).getTime() - Date.now()) / 60000);
  if (o.fulfilment === "pickup") return `Collect by ${clock(o.dueBy)}`;
  return mins >= 0 ? `Due in ${mins} min` : `${-mins} min late`;
}

function OrderCard({ o, busy, act }) {
  const action = nextAction(o);
  const late = o.fulfilment === "delivery" && action && new Date(o.dueBy) < new Date();
  return (
    <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="split" style={{ justifyContent: "space-between" }}>
        <b>#{o.id}</b>
        {o.fulfilment === "delivery"
          ? <span className="badge info"><Bike size={12} /> Delivery</span>
          : <span className="badge neutral"><Store size={12} /> Pickup</span>}
      </div>
      <div>
        <div className="cell-main">{o.buyer.name}</div>
        <div className="cell-sub split"><Phone size={11} /> {o.buyer.phone} · {o.channel === "ngo" ? "NGO" : "Merchant"}</div>
        {o.fulfilment === "delivery" && <div className="cell-sub split" style={{ alignItems: "flex-start" }}><MapPin size={11} style={{ flex: "none", marginTop: 3 }} /> {o.deliverTo} · {o.distanceKm} km</div>}
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 13 }}>
        {o.items.map((it) => (
          <li key={it.claimId} className="split" style={{ gap: 8, padding: "2px 0" }}>
            <img src={art(it.product.image)} alt="" width={20} height={20} />
            <span><b>{it.qty}</b> × {it.product.name}</span>
          </li>
        ))}
      </ul>
      <div className="split" style={{ justifyContent: "space-between", fontSize: 13 }}>
        <span className="split" style={{ color: late ? "var(--clay)" : "var(--muted)" }}><Clock size={12} /> {action ? due(o) : clock(o.completedAt ?? o.cancelledAt ?? o.placedAt)}</span>
        <b>{o.channel === "ngo" ? "Free" : money2(o.grandTotal)}</b>
      </div>
      {action ? (
        <div className="split" style={{ gap: 6 }}>
          <button className="btn primary sm" style={{ flex: 1 }} disabled={busy} onClick={() => act(o, "advance", action)}>{action}</button>
          {["placed", "packed"].includes(o.status) && <button className="btn ghost sm" disabled={busy} onClick={() => act(o, "cancel", "Order cancelled")}>Cancel</button>}
          {o.status === "ready_for_pickup" && <button className="btn ghost sm" disabled={busy} onClick={() => act(o, "no-show", "Marked as not collected")}>No-show</button>}
        </div>
      ) : (
        <StatusBadge status={o.status} />
      )}
    </div>
  );
}

export default function OrdersBoard() {
  const toast = useToast();
  const { data, error, reload } = useApi("/store-orders");
  const [busy, setBusy] = useState(false);

  // New orders arrive while the page is open.
  useEffect(() => {
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [reload]);

  const act = async (o, path, msg) => {
    setBusy(true);
    try {
      await api(`/store-orders/${o.id}/${path}`, { method: "POST" });
      toast(path === "advance" ? `#${o.id}: ${msg.toLowerCase()}` : msg);
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Page title="Orders"><ErrorBox message={error} /></Page>;
  if (!data) return <Page title="Orders"><Loading /></Page>;
  const orders = data.orders;
  const active = orders.filter((o) => !["completed", "cancelled", "no_show"].includes(o.status));
  const done = orders.filter((o) => o.status === "completed");

  return (
    <Page eyebrow="Surplus out" title="Orders" sub="Orders from local merchants and NGOs for your listed surplus. Pack them, hand them to a rider or the counter, and mark them done. This page refreshes by itself.">
      <div className="kpis">
        <Kpi tone="dark" label="Orders to handle" value={active.length} sub={`${active.filter((o) => o.status === "placed").length} new`} />
        <Kpi label="Deliveries" value={active.filter((o) => o.fulfilment === "delivery").length} sub="active" />
        <Kpi label="Pickups" value={active.filter((o) => o.fulfilment === "pickup").length} sub="active" />
        <Kpi label="Completed" value={done.length} sub={`${n(done.reduce((s, o) => s + o.itemCount, 0))} items rescued`} />
      </div>
      {orders.length === 0 ? (
        <section className="card"><Empty title="No orders yet">List surplus from the Inventory page and orders will appear here.</Empty></section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, alignItems: "start" }}>
          {COLUMNS.map(([title, f]) => {
            const list = orders.filter(f).slice(0, title === "Done" ? 8 : 50);
            return (
              <div key={title} style={{ background: "#eceeeb", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="split" style={{ justifyContent: "space-between", padding: "2px 4px" }}>
                  <b style={{ fontSize: 13 }}>{title}</b>
                  <span className="badge neutral">{orders.filter(f).length}</span>
                </div>
                {list.length === 0 ? <div className="cell-sub" style={{ padding: "6px 4px" }}>Nothing here</div> : list.map((o) => <OrderCard key={o.id} o={o} busy={busy} act={act} />)}
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}
