import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api.js";
import { useApi } from "../../useApi.js";
import { useToast } from "../../components/toast.jsx";
import { expiresIn, money2, n, shortDate } from "../../format.js";
import { ClaimBadge, ColdTag, Empty, ErrorBox, Kpi, Loading, Page, StageBadge } from "../../components/ui.jsx";

export default function Listings() {
  const toast = useToast();
  const { data, error, reload } = useApi("/listings");
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("open");

  const act = async (key, path, body, msg) => {
    setBusy(key);
    try {
      await api(path, { method: "POST", body });
      toast(msg);
      reload();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Page title="Listings"><ErrorBox message={error} /></Page>;
  if (!data) return <Page title="Listings"><Loading /></Page>;

  const open = data.listings.filter((l) => l.stage !== "closed");
  const closed = data.listings.filter((l) => l.stage === "closed");
  const shown = tab === "open" ? open : closed;

  return (
    <Page eyebrow="Surplus out" title="Listings" sub="Stock you have offered to local merchants and NGOs. Orders against these listings arrive on the Orders page." right={<Link to="/orders" className="btn primary">Open orders</Link>}>
      <div className="kpis">
        <Kpi tone="dark" label="Units claimed" value={n(data.listings.reduce((s, l) => s + l.claims.filter((c) => c.status !== "cancelled" && c.status !== "no_show").reduce((t, c) => t + c.qty, 0), 0))} sub="by merchants and NGOs" />
        <Kpi label="Open to merchants" value={open.filter((l) => l.stage === "merchant").length} sub="listings" />
        <Kpi label="Open to NGOs" value={open.filter((l) => l.stage === "ngo").length} sub="listings" />
        <Kpi label="Units still available" value={n(open.reduce((s, l) => s + l.qtyAvailable, 0))} sub="across open listings" />
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "open" ? "active" : ""}`} onClick={() => setTab("open")}>Open<span className="n">{open.length}</span></button>
        <button className={`tab ${tab === "closed" ? "active" : ""}`} onClick={() => setTab("closed")}>Closed<span className="n">{closed.length}</span></button>
      </div>

      <section className="card">
        {shown.length === 0 ? (
          <Empty title={tab === "open" ? "No open listings" : "Nothing closed yet"}>{tab === "open" ? "List surplus from the Inventory page." : "Cleared and expired listings appear here."}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Status</th><th className="r">Available</th><th className="r">Price now</th><th>Expiry</th><th className="r">Claims</th><th className="r">Actions</th></tr></thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td><div className="cell-main">{l.product.name}</div><div className="cell-sub split">{l.product.category} {l.product.requiresCold && <ColdTag />}</div></td>
                    <td><StageBadge stage={l.stage} reason={l.closedReason} /></td>
                    <td className="r num">{l.qtyAvailable} / {l.qtyInitial}</td>
                    <td className="r num">{l.stage === "ngo" ? "Free" : l.stage === "merchant" ? <><div>{money2(l.unitPrice)}</div><div className="cell-sub">{l.discountPct}% off</div></> : "–"}</td>
                    <td><div>{shortDate(l.expiryDate)}</div><div className="cell-sub">{expiresIn(l.daysLeft)}</div></td>
                    <td className="r">
                      {l.claims.length === 0 ? <span className="muted">None</span> : l.claims.slice(0, 2).map((c) => <div key={c.id} className="cell-sub">{c.claimant.name}: {c.qty} <ClaimBadge status={c.status} /></div>)}
                    </td>
                    <td className="r">
                      {l.stage === "closed" && l.closedReason === "expired" && l.qtyAvailable > 0 && (
                        <div className="actions">
                          <button className="btn ghost sm" disabled={busy} onClick={() => act(`af${l.id}`, `/listings/${l.id}/recover`, { method: "animal_feed" }, "Sent for animal feed")}>Animal feed</button>
                          <button className="btn ghost sm" disabled={busy} onClick={() => act(`c${l.id}`, `/listings/${l.id}/recover`, { method: "compost" }, "Sent to compost")}>Compost</button>
                        </div>
                      )}
                      {l.stage !== "closed" && (
                        <div className="actions">
                          {l.stage === "merchant" && <button className="btn ghost sm" disabled={busy} onClick={() => act(`e${l.id}`, `/listings/${l.id}/escalate`, undefined, "Sent to NGOs")}>To NGOs</button>}
                          <button className="btn ghost sm" disabled={busy || l.qtyAvailable === 0} onClick={() => act(`w${l.id}`, `/listings/${l.id}/withdraw`, undefined, "Returned to the shelf")}>Withdraw</button>
                          <button className="btn ghost sm" disabled={busy || l.qtyAvailable === 0} onClick={() => act(`r${l.id}`, `/listings/${l.id}/recover`, { method: "compost" }, "Sent to compost")}>Compost</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}
