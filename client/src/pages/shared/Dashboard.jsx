import { Link } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { useApi } from "../../useApi.js";
import { ACTION_TEXT, longDate, money, n, timeAgo } from "../../format.js";
import { Card, Empty, ErrorBox, Kpi, Loading, Page } from "../../components/ui.jsx";

const CHANNELS = [
  ["rebalancedUnits", "Moved to another store", "#3f6455"],
  ["soldToMerchantsUnits", "Sold to local merchants", "#c8553d"],
  ["donatedUnits", "Donated to NGOs", "#e0a458"],
  ["compostedUnits", "Compost or animal feed", "#8aa399"],
  ["expiredUnits", "Expired unsold", "#c9d1cd"],
];

export function ChannelBreakdown({ outcomes }) {
  const total = CHANNELS.reduce((s, [k]) => s + outcomes[k], 0);
  return (
    <>
      <div className="channel-bar" role="img" aria-label="Where at-risk stock went">
        {total > 0 && CHANNELS.map(([k, , c]) => <span key={k} style={{ width: `${(outcomes[k] / total) * 100}%`, background: c }} />)}
      </div>
      <div className="legend">
        {CHANNELS.map(([k, label, c]) => (
          <div key={k} className="legend-item">
            <span className="legend-dot" style={{ background: c }} />
            {label}
            <b>{n(outcomes[k])}</b>
          </div>
        ))}
      </div>
    </>
  );
}

export function ActivityFeed({ items }) {
  if (!items.length) return <Empty title="No activity yet">Actions taken in the portal appear here.</Empty>;
  return (
    <ul className="feed">
      {items.map((a, i) => (
        <li key={i}>
          <span className="dot" />
          <div>
            <div><b>{a.user_name ?? "System"}</b> {ACTION_TEXT[a.action] ?? a.action}</div>
            <div className="cell-sub">{a.detail}</div>
          </div>
          <span className="when">{timeAgo(a.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { user, org } = useAuth();
  const { data, error } = useApi("/dashboard");
  const network = user.role === "admin";

  if (error) return <Page title="Dashboard"><ErrorBox message={error} /></Page>;
  if (!data) return <Page title="Dashboard"><Loading /></Page>;
  const o = data.outcomes;
  const handled = o.rebalancedUnits + o.soldToMerchantsUnits + o.donatedUnits + o.compostedUnits + o.expiredUnits;
  const rescueRate = handled ? Math.round((o.rescuedUnits / handled) * 100) : 0;

  return (
    <Page
      eyebrow={network ? "Network overview" : org.name}
      title={network ? "How the network is doing" : "Today at your store"}
      sub={network ? "At-risk stock across the warehouse and every store, and where flagged stock has gone." : "Stock that will not sell before expiry, and what has happened to stock you flagged."}
      right={<span className="today">{longDate(data.today)}</span>}
    >
      <div className="kpis">
        <Kpi tone="alert" label="At risk right now" value={money(data.risk.surplusValue)} sub={`${n(data.risk.surplusUnits)} units in ${data.risk.atRiskBatches} batches`} />
        <Kpi tone="dark" label="Food rescued" value={n(o.rescuedUnits)} sub={`${rescueRate}% of flagged stock`} />
        <Kpi label="Recovered from merchants" value={money(o.merchantRevenue)} sub={`${n(o.soldToMerchantsUnits)} units sold locally`} />
        <Kpi label="Donated to NGOs" value={n(o.donatedUnits)} sub="units, free of charge" />
      </div>

      <div className="grid-2">
        <Card title="Where flagged stock went" hint="All time, in units">
          <ChannelBreakdown outcomes={o} />
        </Card>
        <Card title="Recent activity" flush>
          <ActivityFeed items={data.recent} />
        </Card>
      </div>

      {network ? (
        <>
          <Card title="Sites" hint="Warehouse and supermarkets" flush>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Site</th><th className="r">At-risk batches</th><th className="r">At-risk value</th><th className="r">Open listings</th><th className="r">Open orders</th><th className="r">Rescued</th></tr>
                </thead>
                <tbody>
                  {data.sites.map((s) => (
                    <tr key={s.id}>
                      <td><div className="cell-main">{s.name}</div><div className="cell-sub">{s.type === "warehouse" ? "Central warehouse" : "Supermarket"}</div></td>
                      <td className="r num">{s.risk.atRiskBatches}</td>
                      <td className="r num">{money(s.risk.surplusValue)}</td>
                      <td className="r num">{s.activeListings}</td>
                      <td className="r num">{s.activeOrders}</td>
                      <td className="r num">{n(s.outcomes.rescuedUnits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Most active merchants" action={<Link to="/partners" className="btn ghost sm">All partners</Link>} flush>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Merchant</th><th className="r">Pickups</th><th className="r">Reliability</th></tr></thead>
                <tbody>
                  {data.merchants.map((m) => (
                    <tr key={m.id}>
                      <td><div className="cell-main">{m.name}</div><div className="cell-sub">{m.address}</div></td>
                      <td className="r num">{m.pickupsTotal}</td>
                      <td className="r">{m.rating ? <span className="stars">{m.rating.toFixed(1)} / 5</span> : <span className="muted">New</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <Card title="Next steps">
          <div className="stat-row">
            <div><span>High-risk batches</span><b>{data.sites[0].risk.highRiskBatches}</b></div>
            <div><span>Open listings</span><b>{data.sites[0].activeListings}</b></div>
            <div><span>Orders to handle</span><b>{data.sites[0].activeOrders}</b></div>
            <div className="spacer" />
            <div className="split">
              <Link to="/inventory" className="btn primary">Review at-risk stock</Link>
              <Link to="/orders" className="btn ghost">Open orders</Link>
            </div>
          </div>
        </Card>
      )}
    </Page>
  );
}
