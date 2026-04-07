import React, { useState } from "react";
import { bootstrapAdmin, login } from "../lib/auth";
import { Session } from "../types";

type AuthPageProps = {
  needsSetup: boolean;
  offlineOnly: boolean;
  onAuthenticated: (session: Session) => void;
};

export default function AuthPage({ needsSetup, offlineOnly, onAuthenticated }: AuthPageProps) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const session = needsSetup
        ? await bootstrapAdmin({
            name: form.name.trim() || "Owner",
            email: form.email.trim(),
            password: form.password
          })
        : await login({
            email: form.email.trim(),
            password: form.password
          });

      onAuthenticated(session);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="eyebrow">Inventory Desk</span>
          <h1>{needsSetup ? "Create the owner account" : "Sign in to the shop system"}</h1>
          <p className="muted">
            {needsSetup
              ? "The first account becomes the admin and can create staff users later."
              : "Staff can use checkout. Admins can also manage products, reports, and team access."}
          </p>
          {offlineOnly && (
            <div className="notice warn">
              Network is required for first-time sign-in. If you already signed in on this device before, reconnect once
              to restore the saved session.
            </div>
          )}
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {needsSetup && (
            <div>
              <label>Name</label>
              <input
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
                placeholder="Owner name"
              />
            </div>
          )}
          <div>
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={event => setForm({ ...form, email: event.target.value })}
              placeholder="owner@shop.com"
              required
            />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={form.password}
              onChange={event => setForm({ ...form, password: event.target.value })}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>
          {error && <div className="notice danger">{error}</div>}
          <button className="primary" type="submit" disabled={loading || offlineOnly}>
            {loading ? "Working..." : needsSetup ? "Create Admin Account" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
