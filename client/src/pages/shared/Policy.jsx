import { useApi } from "../../useApi.js";
import { Card, ErrorBox, Loading, Page } from "../../components/ui.jsx";

export default function Policy() {
  const { data: p, error } = useApi("/policy");
  if (error) return <Page title="Risk policy"><ErrorBox message={error} /></Page>;
  if (!p) return <Page title="Risk policy"><Loading /></Page>;
  const rows = [
    ["Lookahead", `${p.lookaheadDays} days`, "How far ahead the engine looks for stock that will not sell."],
    ["High risk", `≤ ${p.highRiskDays} days to expiry`, "Surplus this close to expiry is flagged red."],
    ["Safety buffer", `${Math.round(p.safetyBuffer * 100)}%`, "Extra stock kept on the shelf above expected sales, so moving surplus out does not cause stockouts."],
    ["Merchant radius", `${p.merchantRadiusKm} km`, "Local merchants see listings from stores within this distance."],
    ["NGO radius", `${p.ngoRadiusKm} km`, "NGOs can travel further, so they see a wider area."],
    ["NGO hand-over", p.ngoEscalationDaysLeft === 0 ? "On expiry day" : `${p.ngoEscalationDaysLeft} day(s) before expiry`, "Unclaimed merchant listings move to NGOs automatically at this point."],
    ["Pickup window", `${p.pickupWindowHours} hours`, "Time a partner has to collect after claiming."],
  ];
  return (
    <Page eyebrow={`Version ${p.version}`} title="Risk policy" sub="The rules the risk engine runs on. They live in server/config/risk-policy.json, and any change must pass the waste gate in the CI pipeline before it ships.">
      <div className="grid-2">
        <Card title="How a batch is scored">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="mono" style={{ background: "var(--sage)", padding: 14, borderRadius: 8, lineHeight: 1.8 }}>
              days left&nbsp;&nbsp;&nbsp;&nbsp;= expiry date − today<br />
              will sell&nbsp;&nbsp;&nbsp;&nbsp;= sells per day × (days left + 1)<br />
              keep&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= will sell × (1 + {p.safetyBuffer})<br />
              surplus&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= on hand − keep (if positive)
            </div>
          </div>
        </Card>
        <Card title="Merchant price schedule" flush>
          <table>
            <thead><tr><th>Days left</th><th className="r">Discount off MRP</th></tr></thead>
            <tbody>
              {[...p.discountSchedule].sort((a, b) => b.minDaysLeft - a.minDaysLeft).map((s) => (
                <tr key={s.minDaysLeft}><td>{s.minDaysLeft === 0 ? "Expiry day" : `${s.minDaysLeft}${s === p.discountSchedule[0] ? "+" : ""} days`}</td><td className="r num">{s.discountPct}%</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title="Settings" flush>
        <table>
          <tbody>
            {rows.map(([k, v, why]) => (
              <tr key={k}><td className="cell-main" style={{ width: 180 }}>{k}</td><td className="num" style={{ width: 200 }}>{v}</td><td className="muted">{why}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
