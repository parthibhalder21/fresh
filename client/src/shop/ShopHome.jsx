import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { ErrorBox } from "../components/ui.jsx";
import { useShop } from "./ShopContext.jsx";
import { ProductCard } from "./parts.jsx";
import { art } from "./art.js";

const CATEGORIES = [
  ["All", "/img/cat-all.svg"],
  ["Dairy", "/img/cat-dairy.svg"],
  ["Bakery", "/img/cat-bakery.svg"],
  ["Fruits", "/img/cat-fruits.svg"],
  ["Vegetables", "/img/cat-vegetables.svg"],
  ["Meat", "/img/cat-meat.svg"],
  ["Ready to cook", "/img/cat-ready.svg"],
];

function Section({ title, sub, items, onAll, row = true }) {
  if (!items.length) return null;
  return (
    <section className="sec">
      <div className="sec-head">
        <div>
          <h3>{title}</h3>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {onAll && <button className="see-all" onClick={onAll}>see all</button>}
      </div>
      <div className={row ? "row" : "grid"}>
        {items.map((l) => <ProductCard key={l.id} l={l} />)}
      </div>
    </section>
  );
}

export default function ShopHome() {
  const shop = useShop();
  const [cat, setCat] = useState("All");
  const all = shop.listings;

  const filtered = useMemo(() => {
    const q = shop.query.trim().toLowerCase();
    return all
      .filter((l) => cat === "All" || l.product.category === cat)
      .filter((l) => !q || `${l.product.name} ${l.product.category} ${l.source.name}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.daysLeft - b.daysLeft || b.discountPct - a.discountPct);
  }, [all, cat, shop.query]);

  if (shop.marketError) return <ErrorBox message={shop.marketError} />;
  if (!shop.market) return <div className="shop-empty">Loading fresh stock near you…</div>;

  const browsing = cat !== "All" || shop.query.trim();
  const best = Math.max(0, ...all.map((l) => l.discountPct));
  const stores = new Set(all.map((l) => l.source.id)).size;
  const byCat = (c) => all.filter((l) => l.product.category === c);

  return (
    <>
      {!shop.market.verified && (
        <div className="notice"><TriangleAlert size={18} /> Your account is waiting for verification by FreshLoop HQ. You can browse, and ordering opens once you're verified.</div>
      )}

      {!browsing && (
        <div className="hero">
          <div className="hero-card main">
            <h2>{shop.ngo ? "Good food, free, before it expires" : `Fresh stock at up to ${best}% off`}</h2>
            <p>{shop.ngo
              ? `Unsold food from ${stores} FreshLoop ${stores === 1 ? "store" : "stores"} near you, free for NGOs and food banks.`
              : `Surplus from ${stores} FreshLoop ${stores === 1 ? "store" : "stores"} near you. Prices drop every day until it's gone.`}</p>
            <button className="hero-cta" onClick={() => document.getElementById("today")?.scrollIntoView({ behavior: "smooth" })}>{shop.ngo ? "See today's donations" : "Shop expiring today"}</button>
            <img src={art("/img/scooter.svg")} alt="" />
          </div>
          <div className="hero-card warm">
            <h2>{shop.ngo ? "Delivered free to your kitchen" : "Free delivery above ₹199"}</h2>
            <p>{shop.ngo ? "Or collect from the store counter." : "Or pick up from the store counter."}</p>
            <img src={art("/img/package.svg")} alt="" />
          </div>
          <div className="hero-card cool">
            <h2>Dairy and meat, kept cold</h2>
            <p>Shown only to partners with a fridge.</p>
            <img src={art("/img/cat-dairy.svg")} alt="" />
          </div>
        </div>
      )}

      <div className="cats" role="tablist" aria-label="Categories">
        {CATEGORIES.map(([name, img]) => (
          <button key={name} className={`cat ${cat === name ? "active" : ""}`} onClick={() => setCat(name)} role="tab" aria-selected={cat === name}>
            <div className="cat-img"><img src={art(img)} alt="" /></div>
            <span>{name}</span>
          </button>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="shop-empty"><img src={art("/img/basket.svg")} alt="" /><h3>Nothing near you right now</h3><p>Stores list surplus through the day. Check back soon.</p></div>
      ) : browsing ? (
        filtered.length ? (
          <Section title={shop.query ? `Results for "${shop.query}"` : cat} sub={`${filtered.length} ${filtered.length === 1 ? "product" : "products"}`} items={filtered} row={false} />
        ) : (
          <div className="shop-empty"><img src={art("/img/cat-all.svg")} alt="" /><h3>No matches</h3><p>Try another word or category.</p></div>
        )
      ) : (
        <>
          <div id="today" />
          <Section
            title={shop.ngo ? "Donations expiring today" : "Last chance: lowest prices"}
            sub={shop.ngo ? "Collect or get it delivered today" : "Expiring today and tomorrow"}
            items={all.filter((l) => l.daysLeft <= 1)}
          />
          <Section title="Dairy and bakery" items={[...byCat("Dairy"), ...byCat("Bakery")]} onAll={() => setCat("Dairy")} />
          <Section title="Fruits and vegetables" items={[...byCat("Fruits"), ...byCat("Vegetables")]} onAll={() => setCat("Fruits")} />
          <Section title="Meat and ready to cook" items={[...byCat("Meat"), ...byCat("Ready to cook")]} onAll={() => setCat("Meat")} />
          <Section title="Everything near you" sub="Sorted by soonest expiry" items={filtered} row={false} />
        </>
      )}
    </>
  );
}
