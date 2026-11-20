import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, ChevronRight, MapPin, Phone } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { clock, money2, n } from "../format.js";
import { ErrorBox } from "../components/ui.jsx";
import { useToast } from "../components/toast.jsx";
import { art } from "./art.js";

// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_TEXT = {
  placed: ["Order placed", "warn"],
  packed: ["Packed", "info"],
  out_for_delivery: ["Out for delivery", "info"],
  ready_for_pickup: ["Ready for pickup", "info"],
  completed: ["Completed", "good"],
  cancelled: ["Cancelled", "danger"],
  no_show: ["Not collected", "danger"],
};

export function StatusBadge({ status }) {
  const [text, tone] = STATUS_TEXT[status] ?? [status, "neutral"];
  return <span className={`badge ${tone}`}>{text}</span>;
}

function minutesLeft(iso) {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

function heroFor(o) {
  const delivery = o.fulfilment === "delivery";
  switch (o.status) {
    case "placed": return { img: "/img/package.svg", h: delivery ? `Arriving in about ${minutesLeft(o.dueBy) || 1} minutes` : "Order received", p: `${o.store.name} has your order and will start packing it.` };
    case "packed": return { img: "/img/package.svg", h: delivery ? "Packed, rider being assigned" : "Packed at the store", p: delivery ? `Leaving ${o.store.name} shortly.` : "It will be at the counter in a moment." };
    case "out_for_delivery": return { img: "/img/scooter.svg", h: `On the way: about ${minutesLeft(o.dueBy) || 1} minutes`, p: `Your rider left ${o.store.name}.` };
    case "ready_for_pickup": return { img: "/img/store.svg", h: "Ready for pickup", p: `Collect from ${o.store.name} by ${clock(o.dueBy)}.` };
    case "completed": return { img: "/img/check.svg", h: delivery ? "Delivered" : "Collected", p: `Thank you for rescuing food from ${o.store.name}.`, cls: "done" };
    case "cancelled": return { img: "/img/basket.svg", h: "Order cancelled", p: "The items have gone back on sale.", cls: "bad" };
    default: return { img: "/img/basket.svg", h: "Not collected", p: "The pickup window passed, so the items went back on sale.", cls: "bad" };
  }
}

export function OrderTrack() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, reload } = useApi(`/orders/${id}`);
  const [busy, setBusy] = useState(false);

  // Live tracking: refresh while the order is moving.
  const active = data && ["placed", "packed", "out_for_delivery", "ready_for_pickup"].includes(data.order.status);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [active, reload]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <div className="shop-empty">Loading order…</div>;
  const o = data.order;
  const hero = heroFor(o);
  const delivery = o.fulfilment === "delivery";
  const steps = [
    ["Order placed", o.placedAt],
    ["Packed", o.packedAt],
    [delivery ? "Out for delivery" : "Ready at the counter", o.dispatchedAt],
    [delivery ? "Delivered" : "Collected", o.completedAt],
  ];
  const doneCount = steps.filter(([, t]) => t).length;
  const free = o.channel === "ngo";

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/orders/${o.id}/cancel`, { method: "POST" });
      toast("Order cancelled");
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="track">
      <div className={`track-hero ${hero.cls ?? ""}`}>
        <img src={art(hero.img)} alt="" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.8 }}>Order #{o.id} · {delivery ? "Delivery" : "Pickup"}</div>
          <h1>{hero.h}</h1>
          <p>{hero.p}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="box" style={{ border: "1px solid var(--line)" }}>
          <div className="box-title">{n(o.itemCount)} {o.itemCount === 1 ? "item" : "items"} from {o.store.name}</div>
          {o.items.map((it) => (
            <div className="line" key={it.claimId}>
              <div className="line-img"><img src={art(it.product.image)} alt="" /></div>
              <div className="line-info">
                <div className="line-name">{it.product.name}</div>
                <div className="line-sub">{it.qty} × {free ? "Free" : money2(it.unitPrice)}</div>
              </div>
              <div className="line-price">{free ? "Free" : money2(it.total)}{!free && <s>{money2(it.qty * it.mrp)}</s>}</div>
            </div>
          ))}
        </div>
        <div className="box" style={{ border: "1px solid var(--line)" }}>
          <div className="box-title">Bill</div>
          <div className="bill-row"><span>Items total</span><span>{!free && <s>{money2(o.mrpTotal)}</s>}{free ? "Free" : money2(o.itemTotal)}</span></div>
          <div className="bill-row"><span>Delivery charge</span><span>{o.deliveryFee ? money2(o.deliveryFee) : <span className="tag-free">FREE</span>}</span></div>
          <div className="bill-row total"><span>{o.status === "completed" ? "Paid" : "To pay at handover"}</span><span>{free ? "Free" : money2(o.grandTotal)}</span></div>
        </div>
        <div className="saved"><img src={art("/img/seedling.svg")} alt="" /><div>{free ? <>You received food worth <b>{money2(o.mrpTotal)}</b></> : <>You saved <b>{money2(o.savings)}</b></>} and kept {n(o.itemCount)} {o.itemCount === 1 ? "item" : "items"} out of the bin.</div></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="box" style={{ border: "1px solid var(--line)" }}>
          <div className="box-title">Order status</div>
          <div className="steps">
            {steps.map(([label, t], i) => (
              <div key={label} className={`step ${t ? "done" : ""} ${i === doneCount && !["cancelled", "no_show"].includes(o.status) ? "now" : ""}`}>
                <div className="dot2">{t && <Check size={15} strokeWidth={3} />}</div>
                <div><b>{label}</b><span>{t ? clock(t) : i === doneCount && !["cancelled", "no_show"].includes(o.status) ? "In progress" : ""}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="box" style={{ border: "1px solid var(--line)" }}>
          <div className="box-title">{delivery ? "Delivery details" : "Pickup details"}</div>
          {delivery ? (
            <div className="line-sub split" style={{ alignItems: "flex-start" }}><MapPin size={14} style={{ flex: "none", marginTop: 2 }} /> {o.deliverTo}</div>
          ) : (
            <div className="line-sub split" style={{ alignItems: "flex-start" }}><MapPin size={14} style={{ flex: "none", marginTop: 2 }} /> {o.store.name}, {o.store.address}</div>
          )}
          <div className="line-sub split" style={{ marginTop: 8 }}><Phone size={14} /> Store: {o.store.phone}</div>
          <div className="line-sub" style={{ marginTop: 8 }}>Placed {clock(o.placedAt)} · {o.distanceKm} km away</div>
        </div>
        {o.status === "placed" && <button className="btn ghost" disabled={busy} onClick={cancel}>Cancel order</button>}
        <Link to="/" className="btn primary">Continue shopping</Link>
      </div>
    </div>
  );
}

export function OrderList() {
  const { data, error } = useApi("/orders");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <div className="shop-empty">Loading orders…</div>;
  return (
    <>
      <div className="page-h"><h1>My orders</h1></div>
      {data.orders.length === 0 ? (
        <div className="shop-empty"><img src={art("/img/package.svg")} alt="" /><h3>No orders yet</h3><p>Everything you order shows up here.</p><Link to="/" className="btn primary" style={{ marginTop: 14 }}>Start shopping</Link></div>
      ) : (
        <div className="olist">
          {data.orders.map((o) => (
            <Link key={o.id} to={`/orders/${o.id}`} className="ocard">
              <div className="othumbs">
                {o.items.slice(0, 3).map((it) => <div key={it.claimId} className="line-img"><img src={art(it.product.image)} alt="" /></div>)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="split" style={{ gap: 8 }}><b>Order #{o.id}</b><StatusBadge status={o.status} /></div>
                <div className="line-sub">{o.store.name} · {o.fulfilment === "delivery" ? "Delivery" : "Pickup"} · {clock(o.placedAt)}</div>
                <div className="line-sub">{o.items.map((i) => `${i.qty} × ${i.product.name}`).join(", ")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <b>{o.channel === "ngo" ? "Free" : money2(o.grandTotal)}</b>
                {o.savings > 0 && o.channel !== "ngo" && <div className="line-sub" style={{ color: "var(--green)" }}>saved {money2(o.savings)}</div>}
              </div>
              <ChevronRight size={18} color="var(--faint)" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
