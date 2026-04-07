import React, { useEffect, useMemo, useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import CheckoutPage from "./pages/CheckoutPage";
import ReportsPage from "./pages/ReportsPage";
import { loadSnapshot, Snapshot } from "./lib/data";
import { syncNow } from "./lib/sync";

const pages = ["dashboard", "inventory", "checkout", "reports"] as const;

type Page = typeof pages[number];

function getInitialPage(): Page {
  const hash = window.location.hash.replace("#", "");
  return (pages.includes(hash as Page) ? hash : "dashboard") as Page;
}

export default function App() {
  const [page, setPage] = useState<Page>(getInitialPage());
  const [snapshot, setSnapshot] = useState<Snapshot>({
    products: [],
    inventory: [],
    sales: [],
    saleItems: []
  });
  const [syncStatus, setSyncStatus] = useState("idle");

  const refresh = async () => {
    const data = await loadSnapshot();
    setSnapshot(data);
  };

  useEffect(() => {
    const handler = () => setPage(getInitialPage());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setSyncStatus("syncing");
      const result = await syncNow();
      if (!active) return;
      setSyncStatus(result.status);
      await refresh();
    };

    run();
    const interval = setInterval(run, 30000);
    window.addEventListener("online", run);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("online", run);
    };
  }, []);

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

  const navigate = (next: Page) => {
    window.location.hash = next;
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span>Store Ops</span>
          <h1>{title}</h1>
        </div>
        <div className="nav">
          {pages.map(item => (
            <button
              key={item}
              className={page === item ? "active" : ""}
              onClick={() => navigate(item)}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <div className="status-pill">
          {navigator.onLine ? `Sync: ${syncStatus}` : "Offline"}
        </div>
      </div>

      {page === "dashboard" && <DashboardPage snapshot={snapshot} />}
      {page === "inventory" && <InventoryPage snapshot={snapshot} onChange={refresh} />}
      {page === "checkout" && <CheckoutPage snapshot={snapshot} onChange={refresh} />}
      {page === "reports" && <ReportsPage snapshot={snapshot} />}
    </div>
  );
}
