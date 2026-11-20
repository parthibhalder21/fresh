import { useApi } from "../../useApi.js";
import { ACTION_TEXT } from "../../format.js";
import { ErrorBox, Loading, Page } from "../../components/ui.jsx";

export default function Audit() {
  const { data, error } = useApi("/admin/audit?limit=200");
  if (error) return <Page title="Audit log"><ErrorBox message={error} /></Page>;
  if (!data) return <Page title="Audit log"><Loading /></Page>;
  return (
    <Page eyebrow="Security" title="Audit log" sub="Every state-changing action is recorded with who did it and when. Entries cannot be edited from the portal.">
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>When (UTC)</th><th>Who</th><th>Organisation</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.created_at}</td>
                  <td>{e.user_name ?? "System"}<div className="cell-sub">{e.user_role}</div></td>
                  <td>{e.org_name}</td>
                  <td><span className="badge neutral">{e.action}</span><div className="cell-sub">{ACTION_TEXT[e.action]}</div></td>
                  <td className="cell-sub">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}
