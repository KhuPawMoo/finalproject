import React, { useEffect, useState } from "react";
import { createUser, fetchUsers, resetSystemData } from "../lib/auth";
import { formatMoney } from "../lib/currency";
import { Snapshot } from "../lib/data";
import { rollingTotals } from "../lib/reports";
import { Session, SyncConflict, User, UserRole } from "../types";

type DashboardPageProps = {
  snapshot: Snapshot;
  session: Session;
  online: boolean;
  syncConflicts: SyncConflict[];
  onSystemReset: () => Promise<void>;
};

export default function DashboardPage({ snapshot, session, online, syncConflicts, onSystemReset }: DashboardPageProps) {
  const totals = rollingTotals(snapshot);
  const lowStockCount = snapshot.inventory.filter(item => item.quantity <= item.reorderLevel).length;
  const [team, setTeam] = useState<User[]>([]);
  const [teamStatus, setTeamStatus] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "STAFF" as UserRole
  });

  useEffect(() => {
    let active = true;
    if (session.user.role !== "ADMIN" || !online) {
      return;
    }

    fetchUsers()
      .then(users => {
        if (active) {
          setTeam(users);
        }
      })
      .catch(() => {
        if (active) {
          setTeamStatus("Team list will refresh once the API is reachable.");
        }
      });

    return () => {
      active = false;
    };
  }, [online, session.user.role]);

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setTeamStatus("");

    try {
      const user = await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role
      });
      setTeam(current => [...current, user]);
      setForm({ name: "", email: "", password: "", role: "STAFF" });
      setTeamStatus("Team member created.");
    } catch (error) {
      setTeamStatus(error instanceof Error ? error.message : "Unable to create user");
    }
  };

  const handleResetSystem = async () => {
    if (!online) {
      setResetStatus("Reconnect to the internet before resetting the synced system.");
      return;
    }

    const confirmed = confirm("Reset all test data? This removes products, inventory, sales, and staff accounts.");
    if (!confirmed) {
      return;
    }

    setResetting(true);
    setResetStatus("");

    try {
      const result = await resetSystemData();
      await onSystemReset();
      setTeam(team.filter(user => user.id === session.user.id));
      setResetStatus(
        `System reset complete. Removed ${result.deleted.products} products and ${result.deleted.sales} sales.`
      );
    } catch (error) {
      setResetStatus(error instanceof Error ? error.message : "Unable to reset system data");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="stack">
      <div className="grid">
        <div className="card stat-card">
          <h2>Today</h2>
          <div className="stat-number">{formatMoney(totals.today.totalSales)}</div>
          <p className="muted">{totals.today.transactions} transactions</p>
        </div>
        <div className="card stat-card">
          <h2>Last 7 Days</h2>
          <div className="stat-number">{formatMoney(totals.week.totalSales)}</div>
          <p className="muted">{totals.week.transactions} transactions</p>
        </div>
        <div className="card stat-card">
          <h2>Last 30 Days</h2>
          <div className="stat-number">{formatMoney(totals.month.totalSales)}</div>
          <p className="muted">{formatMoney(totals.month.averageSale)} average ticket</p>
        </div>
        <div className="card stat-card">
          <h2>Low Stock</h2>
          <div className="stat-number">{lowStockCount}</div>
          <p className="muted">Items at or below reorder level</p>
        </div>
      </div>

      {syncConflicts.length > 0 && (
        <div className="notice warn">
          {syncConflicts.length} sync conflict{syncConflicts.length === 1 ? "" : "s"} need review. Inventory edits from an
          older device snapshot were not auto-applied.
        </div>
      )}

      <div className="page-columns">
        <div className="section">
          <div className="section-head">
            <h3>Best Sellers</h3>
            <span className="pill">30 days</span>
          </div>
          {totals.month.bestSellers.length === 0 ? (
            <p className="muted">Sales will appear here after the first checkout.</p>
          ) : (
            <div className="compact-list">
              {totals.month.bestSellers.map(item => (
                <div key={item.productId} className="list-row">
                  <div>
                    <strong>{item.productName}</strong>
                    <div className="muted">{item.quantity} units sold</div>
                  </div>
                  <div>{formatMoney(item.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-head">
            <h3>Low Stock Alert</h3>
            <span className="pill danger">{lowStockCount} flagged</span>
          </div>
          {totals.month.lowStock.length === 0 ? (
            <p className="muted">Everything is above reorder level.</p>
          ) : (
            <div className="compact-list">
              {totals.month.lowStock.map(item => (
                <div key={item.productId} className="list-row">
                  <div>
                    <strong>{item.productName}</strong>
                    <div className="muted">Reorder at {item.reorderLevel}</div>
                  </div>
                  <span className="badge low">{item.quantity} left</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {session.user.role === "ADMIN" && (
        <div className="section">
          <div className="section-head">
            <h3>Team Access</h3>
            <span className="pill">Admin only</span>
          </div>
          <div className="page-columns">
            <form className="stack" onSubmit={handleCreateUser}>
              <div className="form-grid">
                <div>
                  <label>Name</label>
                  <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
                </div>
                <div>
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={event => setForm({ ...form, email: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={event => setForm({ ...form, password: event.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label>Role</label>
                  <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}>
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <div className="action-row">
                <button className="primary" type="submit">Create User</button>
                {teamStatus && <span className="muted">{teamStatus}</span>}
              </div>
            </form>

            <div className="compact-list">
              {team.length === 0 ? (
                <p className="muted">No staff accounts yet.</p>
              ) : (
                team.map(user => (
                  <div key={user.id} className="list-row">
                    <div>
                      <strong>{user.name || user.email}</strong>
                      <div className="muted">{user.email}</div>
                    </div>
                    <span className={`badge ${user.role === "ADMIN" ? "ok" : ""}`}>{user.role}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {session.user.role === "ADMIN" && (
        <div className="section danger-zone">
          <div className="section-head">
            <h3>Danger Zone</h3>
            <span className="pill danger">Testing only</span>
          </div>
          <p className="muted">
            Use this before handing the system to the real shop owner. It wipes products, stock, sales, sync queue,
            and staff users, then other devices will clear on their next sync.
          </p>
          <div className="action-row">
            <button className="secondary danger-button" type="button" onClick={handleResetSystem} disabled={resetting}>
              {resetting ? "Resetting..." : "Reset System Data"}
            </button>
            {resetStatus && <span className="muted">{resetStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
