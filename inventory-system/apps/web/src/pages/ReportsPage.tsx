import React, { useMemo, useState } from "react";
import { Snapshot } from "../lib/data";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function ReportsPage({ snapshot }: { snapshot: Snapshot }) {
  const [rangeDays, setRangeDays] = useState(7);

  const { sales, saleItems, products } = snapshot;
  const cutoff = useMemo(() => Date.now() - rangeDays * 24 * 60 * 60 * 1000, [rangeDays]);

  const filteredSales = sales.filter(sale => new Date(sale.createdAt).getTime() >= cutoff);
  const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);

  const bestSellers = saleItems.reduce<Record<string, number>>((acc, item) => {
    const sale = sales.find(s => s.id === item.saleId);
    if (!sale) return acc;
    if (new Date(sale.createdAt).getTime() < cutoff) return acc;
    acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
    return acc;
  }, {});

  const topProducts = Object.entries(bestSellers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([productId, qty]) => ({
      product: products.find(p => p.id === productId),
      qty
    }))
    .filter(entry => entry.product);

  return (
    <div>
      <div className="section">
        <h3>Sales Summary</h3>
        <div className="inline" style={{ marginBottom: 12 }}>
          <label>Range</label>
          <select value={rangeDays} onChange={e => setRangeDays(Number(e.target.value))}>
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        <div className="grid">
          <div className="card">
            <h2>Total Sales</h2>
            <div>{formatMoney(totalSales)}</div>
          </div>
          <div className="card">
            <h2>Transactions</h2>
            <div>{filteredSales.length}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Best-Selling Products</h3>
        {topProducts.length === 0 ? (
          <p className="muted">No sales yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Units Sold</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map(entry => (
                <tr key={entry.product!.id}>
                  <td>{entry.product!.name}</td>
                  <td>{entry.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
