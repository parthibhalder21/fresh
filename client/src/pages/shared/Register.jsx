import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { ErrorBox } from "../../components/ui.jsx";
import { AuthSide } from "./Login.jsx";

// Areas near the demo stores, so new partners land inside a pickup radius.
const AREAS = [
  { name: "Koramangala", lat: 12.9345, lng: 77.6266 },
  { name: "Indiranagar", lat: 12.9716, lng: 77.6412 },
  { name: "Jayanagar", lat: 12.9259, lng: 77.5936 },
  { name: "HSR Layout", lat: 12.9116, lng: 77.6474 },
  { name: "BTM Layout", lat: 12.9166, lng: 77.6101 },
];

export default function Register() {
  const { signIn } = useAuth();
  const [f, setF] = useState({ role: "merchant", name: "", email: "", password: "", orgName: "", address: "", phone: "", area: AREAS[0].name, hasColdStorage: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const area = AREAS.find((a) => a.name === f.area);
    try {
      await signIn("/auth/register", {
        role: f.role, name: f.name, email: f.email, password: f.password, orgName: f.orgName,
        address: `${f.address}, ${area.name}`, phone: f.phone, lat: area.lat, lng: area.lng, hasColdStorage: f.hasColdStorage,
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <AuthSide />
      <div className="auth-main">
        <div className="auth-card wide-card">
          <h2>Register</h2>
          <form onSubmit={submit}>
            <ErrorBox message={error} />
            <div className="tabs">
              <button type="button" className={`tab ${f.role === "merchant" ? "active" : ""}`} onClick={() => setF({ ...f, role: "merchant" })}>Local merchant</button>
              <button type="button" className={`tab ${f.role === "ngo" ? "active" : ""}`} onClick={() => setF({ ...f, role: "ngo" })}>NGO / food bank</button>
            </div>
            <div className="form-grid">
              <div className="field full"><label>{f.role === "merchant" ? "Shop name" : "Organisation name"}</label><input className="input" value={f.orgName} onChange={set("orgName")} required /></div>
              <div className="field"><label>Your name</label><input className="input" value={f.name} onChange={set("name")} required /></div>
              <div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={set("phone")} placeholder="98450 00000" required /></div>
              <div className="field"><label>Street address</label><input className="input" value={f.address} onChange={set("address")} required /></div>
              <div className="field"><label>Area</label>
                <select className="input" value={f.area} onChange={set("area")}>{AREAS.map((a) => <option key={a.name}>{a.name}</option>)}</select>
              </div>
              <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={set("email")} required /></div>
              <div className="field"><label>Password</label><input className="input" type="password" minLength={8} value={f.password} onChange={set("password")} required /><span className="help">At least 8 characters</span></div>
              <label className="check full"><input type="checkbox" checked={f.hasColdStorage} onChange={set("hasColdStorage")} /> We have a working fridge or cold room (needed for dairy and meat)</label>
            </div>
            <button className="btn primary" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
          </form>
          <p className="muted" style={{ marginTop: 14 }}>Already registered? <Link to="/">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
