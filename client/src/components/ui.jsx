import { useEffect } from "react";
import { Snowflake, X } from "lucide-react";

export function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#2E4A3F" />
      <path d="M9 19a7 7 0 0 1 12-6.3" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M23 13a7 7 0 0 1-12 6.3" fill="none" stroke="#E0A458" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M19.5 9.5l2 3.3-3.6.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const RISK_TEXT = { high: "High risk", medium: "Medium risk", watch: "Watch", ok: "On track", expired: "Expired" };
export function RiskBadge({ level }) {
  return <span className={`badge ${level}`}>{RISK_TEXT[level] ?? level}</span>;
}

const STAGE = {
  merchant: ["Open to merchants", "info"],
  ngo: ["Open to NGOs", "warn"],
  cleared: ["Cleared", "good"],
  withdrawn: ["Back on shelf", "neutral"],
  compost: ["Composted", "neutral"],
  animal_feed: ["Animal feed", "neutral"],
  expired: ["Expired unsold", "danger"],
};
export function StageBadge({ stage, reason }) {
  const [text, tone] = STAGE[stage === "closed" ? reason : stage] ?? [stage, "neutral"];
  return <span className={`badge ${tone}`}>{text}</span>;
}

const CLAIM = { claimed: ["In an open order", "warn"], picked_up: ["Collected", "good"], no_show: ["Not collected", "danger"], cancelled: ["Cancelled", "neutral"] };
export function ClaimBadge({ status }) {
  const [text, tone] = CLAIM[status] ?? [status, "neutral"];
  return <span className={`badge ${tone}`}>{text}</span>;
}

export function ColdTag() {
  return (
    <span className="cold" title="Needs cold storage">
      <Snowflake size={12} /> Cold chain
    </span>
  );
}

export function Kpi({ label, value, sub, tone = "" }) {
  return (
    <div className={`card kpi ${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Card({ title, hint, action, children, flush = false }) {
  return (
    <section className="card">
      {(title || action) && (
        <div className="card-head">
          <div>
            <h2>{title}</h2>
            {hint && <div className="hint">{hint}</div>}
          </div>
          {action}
        </div>
      )}
      {flush ? children : <div className="card-body">{children}</div>}
    </section>
  );
}

export function Modal({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="muted" style={{ marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

export function ErrorBox({ message }) {
  return message ? <div className="error">{message}</div> : null;
}

// eslint-disable-next-line no-unused-vars
export function Page({ eyebrow, title, sub, right, children }) {
  return (
    <>
      <header className="topbar">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="page-title">{title}</h1>
        </div>
        {right}
      </header>
      <div className="content">{children}</div>
    </>
  );
}
