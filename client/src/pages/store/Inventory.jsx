import { useMemo, useState } from "react";
import { ArrowRightLeft, Info, Plus, Tags } from "lucide-react";
import { api } from "../../api.js";
import { useApi } from "../../useApi.js";
import { useToast } from "../../components/toast.jsx";
import { expiresIn, longDate, money, money2, n, shortDate, units } from "../../format.js";
import { ColdTag, Empty, ErrorBox, Kpi, Loading, Modal, Page, RiskBadge } from "../../components/ui.jsx";
import { art } from "../../shop/art.js";

const FILTERS = [
  ["risk", "At risk", (b) => ["high", "medium"].includes(b.assessment.riskLevel)],
  ["all", "All stock", () => true],
  ["ok", "On track", (b) => ["ok", "watch"].includes(b.assessment.riskLevel)],
  ["expired", "Expired", (b) => b.assessment.riskLevel === "expired"],
];

function priceFor(basePrice, daysLeft, policy) {
  const step = [...policy.discountSchedule].sort((a, b) => b.minDaysLeft - a.minDaysLeft).find((s) => daysLeft >= s.minDaysLeft);
  return { pct: step.discountPct, price: Math.round(basePrice * (1 - step.discountPct / 100) * 100) / 100 };
}

function RebalanceModal({ batch, onClose, onDone }) {
  const toast = useToast();
  const { data, error } = useApi(`/inventory/batches/${batch.id}/rebalance`);
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const move = async (s) => {
    setBusy(true);
    setErr(null);
    try {
      const q = Number(qty[s.orgId] ?? s.suggestedQty);
      await api(`/inventory/batches/${batch.id}/transfer`, { method: "POST", body: { toOrgId: s.orgId, qty: q } });
      toast(`${q} ${units(batch.product.unit, q)} of ${batch.product.name} moved to ${s.name}`);
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Rebalance to another store" subtitle={`${batch.product.name} · ${batch.assessment.surplus} surplus units · ${expiresIn(batch.assessment.daysLeft).toLowerCase()}`} onClose={onClose}>
      <div className="note"><Info size={16} style={{ flex: "none", marginTop: 1 }} /> Stores that sell this product faster can take some of the surplus before it expires. Suggested amounts never exceed what they expect to sell.</div>
      <ErrorBox message={error || err} />
      {!data ? <Loading /> : data.suggestions.length === 0 ? (
        <Empty title="No store can absorb this stock">List it to local merchants instead.</Empty>
      ) : (
        data.suggestions.map((s) => (
          <div key={s.orgId} className="option">
            <div className="grow">
              <div className="cell-main">{s.name}</div>
              <div className="cell-sub">{s.distanceKm} km away · holds {s.theirQty} · sells {s.theirDailySales}/day</div>
            </div>
            <input className="input" style={{ width: 80 }} type="number" min={1} max={batch.qty} value={qty[s.orgId] ?? s.suggestedQty} onChange={(e) => setQty({ ...qty, [s.orgId]: e.target.value })} aria-label="Quantity to move" />
            <button className="btn primary sm" disabled={busy} onClick={() => move(s)}>Move</button>
          </div>
        ))
      )}
    </Modal>
  );
}

function ListModal({ batch, policy, onClose, onDone }) {
  const toast = useToast();
  const [qty, setQty] = useState(Math.max(1, batch.assessment.surplus));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { daysLeft } = batch.assessment;
  const toNgo = daysLeft <= policy.ngoEscalationDaysLeft;
  const now = priceFor(batch.product.basePrice, daysLeft, policy);
  const schedule = [];
  for (let d = daysLeft; d >= 0 && schedule.length < 4; d--) schedule.push({ d, ...priceFor(batch.product.basePrice, d, policy) });

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api(`/inventory/batches/${batch.id}/list`, { method: "POST", body: { qty: Number(qty) } });
      toast(res.stage === "ngo" ? `Offered to NGOs: ${qty} ${units(batch.product.unit, Number(qty))}` : `Listed for local merchants: ${qty} ${units(batch.product.unit, Number(qty))}`);
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={toNgo ? "Offer to NGOs" : "List for local merchants"}
      subtitle={`${batch.product.name} · ${expiresIn(daysLeft).toLowerCase()}`}
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn accent" disabled={busy || qty < 1} onClick={submit}><Tags size={15} /> {toNgo ? "Offer to NGOs" : "List now"}</button></>}
    >
      <ErrorBox message={err} />
      <div className="field">
        <label htmlFor="qty">Quantity to list</label>
        <input id="qty" className="input" type="number" min={1} max={batch.qty} value={qty} onChange={(e) => setQty(e.target.value)} />
        <span className="help">The risk engine suggests {batch.assessment.surplus} of {batch.qty} {units(batch.product.unit, batch.qty)}. The rest stays on your shelf.</span>
      </div>
      {toNgo ? (
        <div className="note">This expires today, too soon for merchants to resell, so it goes straight to NGOs and food banks within {policy.ngoRadiusKm} km, free of charge.</div>
      ) : (
        <>
          <div className="stat-row">
            <div><span>MRP</span><b>{money2(batch.product.basePrice)}</b></div>
            <div><span>Price today</span><b style={{ color: "var(--clay)" }}>{money2(now.price)}</b></div>
            <div><span>Discount</span><b>{now.pct}%</b></div>
            <div><span>Visible to</span><b>Merchants within {policy.merchantRadiusKm} km</b></div>
          </div>
          <div>
            <div className="cell-sub" style={{ marginBottom: 6 }}>The price drops automatically as expiry gets closer:</div>
            <div className="split" style={{ flexWrap: "wrap" }}>
              {schedule.map((s) => <span key={s.d} className="badge neutral">{s.d === 0 ? "Expiry day" : `${s.d} day${s.d > 1 ? "s" : ""} left`}: {money2(s.price)}</span>)}
            </div>
          </div>
          {batch.product.requiresCold && <div className="note">Needs cold chain: only merchants with a working fridge will see this listing.</div>}
          <div className="note">Anything merchants have not claimed by {policy.ngoEscalationDaysLeft === 0 ? "expiry day" : `${policy.ngoEscalationDaysLeft} day(s) before expiry`} moves to NGOs automatically, free of charge.</div>
        </>
      )}
    </Modal>
  );
}

function AddStockModal({ onClose, onDone }) {
  const toast = useToast();
  const { data } = useApi("/products");
  const [f, setF] = useState({ productId: "", qty: 20, dailySales: 5, expiryDate: "" });
  const [err, setErr] = useState(null);
  const [anomaly, setAnomaly] = useState(false);
  const productId = f.productId || (data ? String(data.products[0].id) : "");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e, confirmAnomaly = false) => {
    e?.preventDefault();
    setErr(null);
    try {
      await api("/inventory/batches", { method: "POST", body: { productId: Number(productId), qty: Number(f.qty), dailySales: Number(f.dailySales), expiryDate: f.expiryDate, confirmAnomaly } });
      toast("Stock added");
      onDone();
    } catch (e2) {
      setAnomaly(e2.status === 409);
      setErr(e2.message);
    }
  };

  return (
    <Modal title="Add a stock batch" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>{anomaly && <button className="btn accent" onClick={() => submit(null, true)}>Save anyway</button>}<button className="btn primary" form="add-stock">Add batch</button></>}>
      <form id="add-stock" className="form-grid" onSubmit={submit}>
        <ErrorBox message={err} />
        <div className="field full"><label>Product</label>
          <select className="input" value={productId} onChange={set("productId")} required>
            {data?.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
          </select>
        </div>
        <div className="field"><label>Quantity</label><input className="input" type="number" min={1} value={f.qty} onChange={set("qty")} required /></div>
        <div className="field"><label>Sells per day</label><input className="input" type="number" min={0} step="0.5" value={f.dailySales} onChange={set("dailySales")} required /><span className="help">Average from recent sales</span></div>
        <div className="field full"><label>Expiry date</label><input className="input" type="date" value={f.expiryDate} onChange={set("expiryDate")} required /></div>
      </form>
    </Modal>
  );
}

export default function Inventory() {
  const { data, error, reload } = useApi("/inventory");
  const { data: policy } = useApi("/policy");
  const [filter, setFilter] = useState("risk");
  const [modal, setModal] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find(([k]) => k === filter)[2];
    const order = { expired: 0, high: 1, medium: 2, watch: 3, ok: 4 };
    return data.batches.filter(f).sort((a, b) => order[a.assessment.riskLevel] - order[b.assessment.riskLevel] || a.assessment.daysLeft - b.assessment.daysLeft);
  }, [data, filter]);

  if (error) return <Page title="Inventory"><ErrorBox message={error} /></Page>;
  if (!data || !policy) return <Page title="Inventory"><Loading /></Page>;
  const s = data.summary;
  const done = () => { setModal(null); reload(); };

  return (
    <Page
      eyebrow={data.org}
      title="Inventory risk"
      sub={`Each batch is scored by comparing what will sell before expiry, plus a ${Math.round(policy.safetyBuffer * 100)}% safety buffer, with what is on hand. Anything above that is surplus at risk of being wasted.`}
      right={<button className="btn primary" onClick={() => setModal({ type: "add" })}><Plus size={16} /> Add stock</button>}
    >
      <div className="kpis">
        <Kpi tone="alert" label="Surplus at risk" value={money(s.surplusValue)} sub={`${n(s.surplusUnits)} units`} />
        <Kpi label="High-risk batches" value={s.highRiskBatches} sub={`expire within ${policy.highRiskDays} days`} />
        <Kpi label="At-risk batches" value={s.atRiskBatches} sub={`within the ${policy.lookaheadDays}-day lookahead`} />
        <Kpi label="Expired on shelf" value={n(s.expiredUnits)} sub="units to clear today" />
      </div>

      <div className="toolbar">
        <div className="tabs">
          {FILTERS.map(([k, label, f]) => (
            <button key={k} className={`tab ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
              {label}<span className="n">{data.batches.filter(f).length}</span>
            </button>
          ))}
        </div>
        <span className="today">Scored on {longDate(data.today)}</span>
      </div>

      <section className="card">
        {rows.length === 0 ? (
          <Empty title="Nothing here">No batches match this filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th><th className="r">On hand</th><th className="r">Sells / day</th><th>Expiry</th>
                  <th className="r">Will sell</th><th className="r">Surplus</th><th>Risk</th><th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const a = b.assessment;
                  const actionable = a.surplus > 0 && a.daysLeft >= 0;
                  return (
                    <tr key={b.id} className={a.riskLevel === "expired" ? "row-expired" : ""}>
                      <td>
                        <div className="split" style={{ gap: 10 }}>
                          <img src={art(b.product.image)} alt="" width={30} height={30} />
                          <div>
                            <div className="cell-main">{b.product.name}</div>
                            <div className="cell-sub split">{b.product.category} {b.product.requiresCold && <ColdTag />}</div>
                          </div>
                        </div>
                      </td>
                      <td className="r num">{n(b.qty)}</td>
                      <td className="r num">{b.dailySales}</td>
                      <td><div>{shortDate(b.expiryDate)}</div><div className="cell-sub">{expiresIn(a.daysLeft)}</div></td>
                      <td className="r num">{a.daysLeft >= 0 ? n(Math.round(a.expectedSales)) : "–"}</td>
                      <td className="r num">
                        <div className="cell-main" style={{ color: a.surplus ? "var(--clay)" : undefined }}>{n(a.surplus)}</div>
                        {a.surplus > 0 && <div className="cell-sub">{money(b.surplusValue)}</div>}
                      </td>
                      <td><RiskBadge level={a.riskLevel} /></td>
                      <td className="r">
                        <div className="actions">
                          {actionable && <button className="btn ghost sm" onClick={() => setModal({ type: "rebalance", batch: b })}><ArrowRightLeft size={14} /> Rebalance</button>}
                          {actionable && <button className="btn accent sm" onClick={() => setModal({ type: "list", batch: b })}><Tags size={14} /> List</button>}
                          {!actionable && a.riskLevel === "expired" && <span className="cell-sub">Remove from shelf</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal?.type === "add" && <AddStockModal onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "rebalance" && <RebalanceModal batch={modal.batch} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "list" && <ListModal batch={modal.batch} policy={policy} onClose={() => setModal(null)} onDone={done} />}
    </Page>
  );
}
