import React, { useEffect, useMemo, useState } from "react";
import { fetchReportSummary, fetchTimeseries } from "../lib/auth";
import { Snapshot } from "../lib/data";
import { summarizeSnapshot } from "../lib/reports";
import { ReportSummary, SyncConflict, TimeseriesPoint } from "../types";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

type ReportsPageProps = {
  snapshot: Snapshot;
  syncConflicts: SyncConflict[];
  online: boolean;
};

function toIsoDate(input: Date) {
  return input.toISOString();
}

export default function ReportsPage({ snapshot, syncConflicts, online }: ReportsPageProps) {
  const [rangeDays, setRangeDays] = useState(30);
  const [remoteSummary, setRemoteSummary] = useState<ReportSummary | null>(null);
  const [remoteSeries, setRemoteSeries] = useState<TimeseriesPoint[] | null>(null);
  const [status, setStatus] = useState("");

  const localSummary = useMemo(() => summarizeSnapshot(snapshot, rangeDays), [snapshot, rangeDays]);
  const summary = remoteSummary || localSummary;
  const series = remoteSeries || localSummary.series;

  useEffect(() => {
    let active = true;
    if (!online) {
      setRemoteSummary(null);
      setRemoteSeries(null);
      setStatus("Offline mode: showing local reports.");
      return;
    }

    const to = new Date();
    const from = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const bucket = rangeDays <= 14 ? "day" : rangeDays <= 60 ? "week" : "month";

    Promise.all([
      fetchReportSummary(toIsoDate(from), toIsoDate(to)),
      fetchTimeseries(toIsoDate(from), toIsoDate(to), bucket)
    ])
      .then(([summaryResult, seriesResult]) => {
        if (!active) {
          return;
        }
        setRemoteSummary(summaryResult);
        setRemoteSeries(seriesResult);
        setStatus("Live data from the API.");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setRemoteSummary(null);
        setRemoteSeries(null);
        setStatus("Using local data because the reports API was unavailable.");
      });

    return () => {
      active = false;
    };
  }, [online, rangeDays]);

  const exportSalesCsv = () => {
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const rows = snapshot.sales
      .filter(sale => new Date(sale.createdAt).getTime() >= cutoff)
      .map(sale => [sale.id, sale.createdAt, sale.userId, sale.total, sale.paidAmount, sale.changeAmount].join(","));
    const content = ["sale_id,created_at,user_id,total,paid_amount,change_amount", ...rows].join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-${rangeDays}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportBackupJson = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxSeriesValue = Math.max(1, ...series.map(point => point.total));

  return (
    <div className="stack">
      <div className="section">
        <div className="section-head">
          <h3>Sales Reports</h3>
          <div className="action-row">
            <select value={rangeDays} onChange={event => setRangeDays(Number(event.target.value))}>
              <option value={1}>Today</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button className="secondary" type="button" onClick={exportSalesCsv}>Export CSV</button>
            <button className="secondary" type="button" onClick={exportBackupJson}>Backup JSON</button>
          </div>
        </div>
        <div className="muted">{status}</div>
      </div>

      <div className="grid">
        <div className="card stat-card">
          <h2>Total Sales</h2>
          <div className="stat-number">{formatMoney(summary.totalSales)}</div>
        </div>
        <div className="card stat-card">
          <h2>Transactions</h2>
          <div className="stat-number">{summary.transactions}</div>
        </div>
        <div className="card stat-card">
          <h2>Average Ticket</h2>
          <div className="stat-number">{formatMoney(summary.averageSale)}</div>
        </div>
        <div className="card stat-card">
          <h2>Low Stock</h2>
          <div className="stat-number">{summary.lowStock.length}</div>
        </div>
      </div>

      <div className="page-columns">
        <div className="section">
          <div className="section-head">
            <h3>Sales Trend</h3>
            <span className="pill">{series.length} buckets</span>
          </div>
          {series.length === 0 ? (
            <p className="muted">No sales yet for this range.</p>
          ) : (
            <div className="chart">
              {series.map(point => (
                <div key={point.bucket} className="bar-row">
                  <div className="bar-label">{point.bucket}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(point.total / maxSeriesValue) * 100}%` }} />
                  </div>
                  <div className="bar-value">{formatMoney(point.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <div className="section-head">
            <h3>Best Sellers</h3>
            <span className="pill">{summary.bestSellers.length} products</span>
          </div>
          {summary.bestSellers.length === 0 ? (
            <p className="muted">No products sold yet.</p>
          ) : (
            <div className="compact-list">
              {summary.bestSellers.map(item => (
                <div key={item.productId} className="list-row">
                  <div>
                    <strong>{item.productName}</strong>
                    <div className="muted">{item.quantity} units</div>
                  </div>
                  <div>{formatMoney(item.revenue)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="page-columns">
        <div className="section">
          <div className="section-head">
            <h3>Low Stock Alerts</h3>
            <span className="pill danger">{summary.lowStock.length} flagged</span>
          </div>
          {summary.lowStock.length === 0 ? (
            <p className="muted">No low-stock alerts for the selected range.</p>
          ) : (
            <div className="compact-list">
              {summary.lowStock.map(item => (
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

        <div className="section">
          <div className="section-head">
            <h3>Sync Review</h3>
            <span className="pill">{syncConflicts.length} conflicts</span>
          </div>
          {syncConflicts.length === 0 ? (
            <p className="muted">No unresolved sync conflicts.</p>
          ) : (
            <div className="compact-list">
              {syncConflicts.map(conflict => (
                <div key={conflict.mutationId} className="list-row">
                  <div>
                    <strong>{conflict.table}</strong>
                    <div className="muted">{conflict.reason}</div>
                  </div>
                  <span className="badge low">Needs review</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
