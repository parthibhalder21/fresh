import { useState } from "react";
import { BadgeCheck, TriangleAlert } from "lucide-react";
import { api } from "../../api.js";
import { useAuth } from "../../auth.jsx";
import { useToast } from "../../components/toast.jsx";
import { Card, ErrorBox, Page } from "../../components/ui.jsx";

export default function Profile() {
  const { org, user, setOrg } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ phone: org.phone, address: org.address, hasColdStorage: org.hasColdStorage });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api("/me/org", { method: "PATCH", body: f });
      setOrg(res.org);
      toast("Profile saved");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page eyebrow={user.role === "ngo" ? "Organisation" : "Shop profile"} title={org.name} sub="Keep your contact details and storage up to date. Stores see these when you claim stock.">
      <div className="grid-2">
        <Card title="Details">
          <form className="form-grid" onSubmit={save}>
            <ErrorBox message={err} />
            <div className="field full"><label>Address</label><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="field"><label>Signed in as</label><input className="input" value={user.email} disabled /></div>
            <label className="check full"><input type="checkbox" checked={f.hasColdStorage} onChange={(e) => setF({ ...f, hasColdStorage: e.target.checked })} /> We have a working fridge or cold room. This unlocks dairy and meat listings.</label>
            <div className="full"><button className="btn primary" disabled={busy}>Save changes</button></div>
          </form>
        </Card>
        <Card title="Standing with FreshLoop">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {org.verified ? (
              <div className="split"><BadgeCheck size={18} color="var(--green)" /> <b>Verified partner</b></div>
            ) : (
              <div className="split" style={{ color: "var(--amber)" }}><TriangleAlert size={18} /> <b>Waiting for verification by HQ</b></div>
            )}
            <div className="stat-row">
              <div><span>Pickups</span><b>{org.pickupsTotal}</b></div>
              <div><span>On time</span><b>{org.pickupsOnTime}</b></div>
              <div><span>Reliability</span><b className="stars">{org.rating ? `${org.rating.toFixed(1)} / 5` : "New"}</b></div>
            </div>
            <p className="muted">Reliability is the share of pickups you collect on time, out of 5. Stores rely on it when stock is short-dated.</p>
          </div>
        </Card>
      </div>
    </Page>
  );
}
