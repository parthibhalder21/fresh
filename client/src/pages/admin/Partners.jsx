import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { api } from "../../api.js";
import { useApi } from "../../useApi.js";
import { useToast } from "../../components/toast.jsx";
import { Empty, ErrorBox, Loading, Page } from "../../components/ui.jsx";

const TABS = [["merchant", "Local merchants"], ["ngo", "NGOs"], ["store", "Supermarkets"], ["warehouse", "Warehouse"]];

export default function Partners() {
  const toast = useToast();
  const [type, setType] = useState("merchant");
  const { data, error, reload } = useApi("/admin/orgs");

  const verify = async (o, verified) => {
    try {
      await api(`/admin/orgs/${o.id}/verify`, { method: "POST", body: { verified } });
      toast(verified ? `${o.name} can now claim stock` : `${o.name} suspended`);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  if (error) return <Page title="Partners"><ErrorBox message={error} /></Page>;
  if (!data) return <Page title="Partners"><Loading /></Page>;
  const rows = data.orgs.filter((o) => o.type === type);
  const pending = data.orgs.filter((o) => !o.verified);
  const partner = type === "merchant" || type === "ngo";

  return (
    <Page eyebrow="Network" title="Partners" sub="Everyone in the FreshLoop network. New merchants and NGOs cannot claim stock until HQ verifies them.">
      {pending.length > 0 && (
        <div className="banner"><BadgeCheck size={18} style={{ flex: "none" }} /><div><b>{pending.length} partner{pending.length > 1 ? "s" : ""} waiting for verification:</b> {pending.map((p) => p.name).join(", ")}</div></div>
      )}
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab ${type === k ? "active" : ""}`} onClick={() => setType(k)}>{label}<span className="n">{data.orgs.filter((o) => o.type === k).length}</span></button>
        ))}
      </div>
      <section className="card">
        {rows.length === 0 ? <Empty title="None yet">Partners appear here once they register.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Cold storage</th>{partner && <><th className="r">Pickups</th><th className="r">Reliability</th><th>Status</th><th className="r">Actions</th></>}</tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><div className="cell-main">{o.name}</div><div className="cell-sub">{o.address}</div></td>
                    <td className="num">{o.phone}</td>
                    <td>{o.hasColdStorage ? <span className="badge watch">Yes</span> : <span className="badge neutral">No</span>}</td>
                    {partner && (
                      <>
                        <td className="r num">{o.pickupsOnTime} / {o.pickupsTotal} on time</td>
                        <td className="r">{o.rating ? <span className="stars">{o.rating.toFixed(1)}</span> : <span className="muted">New</span>}</td>
                        <td>{o.verified ? <span className="badge good">Verified</span> : <span className="badge warn">Pending</span>}</td>
                        <td className="r">
                          {o.verified
                            ? <button className="btn ghost sm" onClick={() => verify(o, false)}>Suspend</button>
                            : <button className="btn primary sm" onClick={() => verify(o, true)}>Verify</button>}
                        </td>
                      </>
                    )}
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
