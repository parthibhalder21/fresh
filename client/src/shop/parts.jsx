import { Clock, MapPin, Minus, Plus, Snowflake } from "lucide-react";
import { money2, units } from "../format.js";
import { useShop } from "./ShopContext.jsx";
import { art } from "./art.js";

// eslint-disable-next-line react-refresh/only-export-components
export function expiryChip(daysLeft) {
  if (daysLeft <= 0) return "Expires today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

export function Stepper({ listing, compact = false }) {
  const { cart, setQty, market, ngo } = useShop();
  const qty = cart[listing.id] ?? 0;
  const locked = !listing.eligible || market?.verified === false;
  if (qty === 0) {
    return (
      <button className="add" disabled={locked || listing.qtyAvailable === 0} onClick={() => setQty(listing.id, 1)} aria-label={`Add ${listing.product.name}`}>
        {ngo ? "CLAIM" : "ADD"}
      </button>
    );
  }
  return (
    <div className="stepper" style={compact ? { minWidth: 70 } : undefined}>
      <button onClick={() => setQty(listing.id, qty - 1)} aria-label="Remove one"><Minus size={14} strokeWidth={3} /></button>
      <span>{qty}</span>
      <button onClick={() => setQty(listing.id, qty + 1)} disabled={qty >= listing.qtyAvailable} aria-label="Add one"><Plus size={14} strokeWidth={3} /></button>
    </div>
  );
}

export function ProductCard({ l }) {
  const { ngo } = useShop();
  return (
    <article className="pc">
      <div className="pc-img">
        {ngo ? <span className="pc-off free">FREE</span> : <span className="pc-off">{l.discountPct}%<br />OFF</span>}
        {l.product.requiresCold && <span className="pc-cold"><Snowflake size={10} /> Chilled</span>}
        <img src={art(l.product.image)} alt="" loading="lazy" />
      </div>
      <div className="pc-body">
        <span className={`pc-timer ${l.daysLeft <= 0 ? "today" : ""}`}><Clock size={10} strokeWidth={3} /> {expiryChip(l.daysLeft)}</span>
        <div className="pc-name">{l.product.name}</div>
        <div className="pc-unit">1 {l.product.unit} · {l.qtyAvailable} {units(l.product.unit, l.qtyAvailable)} left</div>
        <div className="pc-store"><MapPin size={10} /> {l.source.name.replace("FreshLoop ", "")} · {l.distanceKm} km</div>
        <div className="pc-foot">
          <div>
            {ngo ? <div className="pc-price">Free</div> : <><div className="pc-price">{money2(l.unitPrice)}</div><div className="pc-mrp">{money2(l.basePrice)}</div></>}
          </div>
          {l.eligible ? <Stepper listing={l} /> : <div className="pc-locked">Needs a<br />fridge</div>}
        </div>
      </div>
    </article>
  );
}

/** Delivery time from a store, using the same formula as the server. */
// eslint-disable-next-line react-refresh/only-export-components
export function etaFor(distanceKm, f) {
  return Math.round(f.deliveryBaseMinutes + f.deliveryMinutesPerKm * distanceKm);
}
