import Link from "next/link";
import { Check, Database, ShieldCheck, Users, Warehouse } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, type User } from "@/lib/auth-core";
import { getDb } from "@/lib/db";
import { PageHeading } from "@/components/ui";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const warehouses = db
    .prepare(
      "SELECT name,city,code FROM warehouses WHERE customer_id=? OR ? IS NULL ORDER BY name",
    )
    .all(user.customer_id || null, user.customer_id || null) as {
    name: string;
    city: string;
    code: string;
  }[];
  const users = can(user.role, "manage_users")
    ? (db
        .prepare("SELECT name,email,role,id FROM users ORDER BY role")
        .all() as User[])
    : null;
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Workspace settings"
        description="Your profile, your team, and the foundation underneath."
      />
      {params.saved && (
        <div className="alert alert-success" role="status">
          <Check size={18} />
          Your profile has been saved.
        </div>
      )}
      {params.error && (
        <div className="alert alert-error" role="alert">
          Use a name between 2 and 80 characters, without control characters.
        </div>
      )}
      <div className="settings-grid">
        <section className="card settings-card">
          <div className="card-heading">
            <div>
              <h2>Your profile</h2>
              <p className="muted">How you appear in this workspace</p>
            </div>
            <span className="settings-icon">
              <Users size={21} />
            </span>
          </div>
          <form action="/api/profile" method="post" className="profile-form">
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              name="name"
              defaultValue={user.name}
              minLength={2}
              maxLength={80}
              required
            />
            <label htmlFor="profile-email">Email address</label>
            <input id="profile-email" value={user.email} readOnly />
            <div className="profile-role">
              <span>Workspace role</span>
              <span className="role-pill">
                {user.customer_id ? "Customer" : user.role}
              </span>
            </div>
            <p className="field-help">
              Role and email changes are managed by your administrator.
            </p>
            <button className="button">Save changes</button>
          </form>
        </section>
        <section className="card settings-card">
          <div className="card-heading">
            <div>
              <h2>Workspace details</h2>
              <p className="muted">A local foundation, ready to grow</p>
            </div>
            <span className="settings-icon">
              <Database size={21} />
            </span>
          </div>
          <dl className="details-list">
            <div>
              <dt>Organization</dt>
              <dd>Avon Solutions & Logistics</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>Local development</dd>
            </div>
            <div>
              <dt>Data source</dt>
              <dd>Persistent local records</dd>
            </div>
            <div>
              <dt>Carrier connections</dt>
              <dd>None connected</dd>
            </div>
            <div>
              <dt>Session duration</dt>
              <dd>8 hours</dd>
            </div>
            <div>
              <dt>Current release</dt>
              <dd>Stage 2 · Orders & customers</dd>
            </div>
          </dl>
          <div className="notice">
            <ShieldCheck size={20} />
            <span>
              Role permissions are checked on the server. Signing out revokes
              this session immediately.
            </span>
          </div>
        </section>
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Pickup locations</h2>
            <p className="muted">
              <Link href="/warehouses">Manage pickup locations →</Link>
            </p>
          </div>
          <Warehouse size={22} />
        </div>
        <div className="warehouse-grid">
          {warehouses.map((w) => (
            <article key={w.code}>
              <span className="warehouse-code">{w.code}</span>
              <h3>{w.name}</h3>
              <p>{w.city}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="card team-card">
        <div className="card-heading">
          <div>
            <h2>Team & access</h2>
            <p className="muted">
              Admin manages access. Operator works on shipments. Viewer reads
              activity.
            </p>
          </div>
          <span className="role-pill">Admin only</span>
        </div>
        {users ? (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Local workspace accounts</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="role-pill">{u.role}</span>
                    </td>
                    <td>
                      {u.role === "admin"
                        ? "Full workspace"
                        : u.role === "operator"
                          ? "Operations"
                          : "Read only"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="restricted-state">
            <ShieldCheck size={26} />
            <div>
              <h3>Administrator access required</h3>
              <p>
                Your profile is available above. Only administrators can view
                the team directory.
              </p>
            </div>
          </div>
        )}
      </section>
      <p className="settings-back">
        <Link href="/dashboard">← Back to overview</Link>
      </p>
    </>
  );
}
