import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { ErrorBox, Logo } from "../../components/ui.jsx";

const DEMO = [
  { email: "admin@freshloop.test", label: "HQ operations", sub: "Central warehouse" },
  { email: "koramangala@freshloop.test", label: "Store manager", sub: "FreshLoop Koramangala" },
  { email: "lakshmi@kirana.test", label: "Local merchant", sub: "Sri Lakshmi Kirana" },
  { email: "annadaana@ngo.test", label: "NGO partner", sub: "Annadaana Food Bank" },
];
export const DEMO_PASSWORD = "Demo@1234";

export function AuthSide() {
  return (
    <aside className="auth-side">
      <div className="split" style={{ gap: 10 }}>
        <Logo size={34} />
        <div className="brand-name" style={{ color: "#fff" }}>FreshLoop</div>
      </div>
      <h1>Fresh stock from stores near you, before it expires.</h1>
    </aside>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds = { email, password }) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("/auth/login", creds);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <AuthSide />
      <div className="auth-main">
        <div className="auth-card">
          <h2>Sign in</h2>
          <form onSubmit={submit}>
            <ErrorBox message={error} />
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p className="muted" style={{ marginTop: 14 }}>
            New shop or NGO? <Link to="/register">Register</Link>
          </p>
          <div className="demo">
            <div className="demo-title">Quick sign in</div>
            <div className="demo-grid">
              {DEMO.map((d) => (
                <button key={d.email} type="button" className="demo-btn" disabled={busy} onClick={() => submit(null, { email: d.email, password: DEMO_PASSWORD })}>
                  <b>{d.label}</b>
                  <span>{d.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
