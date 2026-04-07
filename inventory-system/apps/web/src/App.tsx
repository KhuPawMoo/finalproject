import React, { useEffect, useMemo, useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import CheckoutPage from "./pages/CheckoutPage";
import ReportsPage from "./pages/ReportsPage";
import AuthPage from "./pages/AuthPage";
import { loadSnapshot, Snapshot } from "./lib/data";
import { syncNow } from "./lib/sync";
import { clearSession, getSession, saveSession } from "./lib/session";
import { fetchCurrentUser, fetchSetupStatus } from "./lib/auth";
import { Session, SyncConflict } from "./types";

const adminPages = ["dashboard", "inventory", "checkout", "reports"] as const;
const staffPages = ["dashboard", "checkout"] as const;

type Page = (typeof adminPages)[number];

function getInitialPage(): Page {
  const hash = window.location.hash.replace("#", "");
  return (adminPages.includes(hash as Page) ? hash : "dashboard") as Page;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [page, setPage] = useState<Page>(getInitialPage());
  const [snapshot, setSnapshot] = useState<Snapshot>({
    products: [],
    inventory: [],
    sales: [],
    saleItems: [],
    stockMovements: []
  });
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);

  const availablePages = session?.user.role === "ADMIN" ? adminPages : staffPages;

  const refresh = async () => {
    const data = await loadSnapshot();
    setSnapshot(data);
  };

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const handler = () => setPage(getInitialPage());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const stored = getSession();
      if (stored) {
        setSession(stored);
        if (navigator.onLine) {
          try {
            const user = await fetchCurrentUser();
            if (!cancelled) {
              const nextSession = { ...stored, user };
              saveSession(nextSession);
              setSession(nextSession);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            const invalidSession = /invalid token|user not found|missing bearer token/i.test(message);
            if (invalidSession) {
              clearSession();
              if (!cancelled) {
                setSession(null);
              }
            } else if (!cancelled) {
              setSession(stored);
            }
          }
        }
      } else if (navigator.onLine) {
        try {
          const status = await fetchSetupStatus();
          if (!cancelled) {
            setNeedsSetup(status.needsSetup);
          }
        } catch {
          if (!cancelled) {
            setNeedsSetup(false);
          }
        }
      }

      if (!cancelled) {
        setAuthReady(true);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    let active = true;
    const runSync = async () => {
      setSyncStatus("syncing");
      const result = await syncNow();
      if (!active) {
        return;
      }

      setSyncStatus(result.status);
      setSyncConflicts(result.conflicts);
      await refresh();
    };

    runSync();
    const interval = window.setInterval(runSync, 30000);
    window.addEventListener("online", runSync);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", runSync);
    };
  }, [session]);

  useEffect(() => {
    if (!availablePages.includes(page)) {
      window.location.hash = availablePages[0];
    }
  }, [availablePages, page]);

  const title = useMemo(() => {
    switch (page) {
      case "inventory":
        return "Inventory";
      case "checkout":
        return "Checkout";
      case "reports":
        return "Reports";
      default:
        return "Dashboard";
    }
  }, [page]);

  const handleAuthenticated = (nextSession: Session) => {
    saveSession(nextSession);
    setSession(nextSession);
    setNeedsSetup(false);
    setAuthReady(true);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setSyncConflicts([]);
    setSyncStatus("idle");
  };

  const navigate = (next: Page) => {
    window.location.hash = next;
  };

  if (!authReady) {
    return <div className="auth-shell"><div className="auth-card">Loading...</div></div>;
  }

  if (!session) {
    return (
      <AuthPage
        needsSetup={needsSetup}
        offlineOnly={!isOnline}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span>Store Ops</span>
          <h1>{title}</h1>
        </div>

        <div className="nav">
          {availablePages.map(item => (
            <button
              key={item}
              className={page === item ? "active" : ""}
              onClick={() => navigate(item)}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        <div className="topbar-actions">
          <div className="user-chip">
            <strong>{session.user.name || session.user.email}</strong>
            <span>{session.user.role}</span>
          </div>
          <div className="status-pill">
            {isOnline ? `Sync: ${syncStatus}` : "Offline"}
            {syncConflicts.length > 0 ? ` (${syncConflicts.length} conflicts)` : ""}
          </div>
          <button className="secondary" type="button" onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </div>

      {page === "dashboard" && (
        <DashboardPage
          snapshot={snapshot}
          session={session}
          online={isOnline}
          syncConflicts={syncConflicts}
        />
      )}
      {page === "inventory" && session.user.role === "ADMIN" && (
        <InventoryPage
          snapshot={snapshot}
          onChange={refresh}
          syncConflicts={syncConflicts}
        />
      )}
      {page === "checkout" && (
        <CheckoutPage
          snapshot={snapshot}
          session={session}
          onChange={refresh}
        />
      )}
      {page === "reports" && session.user.role === "ADMIN" && (
        <ReportsPage
          snapshot={snapshot}
          syncConflicts={syncConflicts}
          online={isOnline}
        />
      )}
    </div>
  );
}
