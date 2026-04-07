import React from "react";
import { Snapshot } from "../lib/data";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function DashboardPage({ snapshot }: { snapshot: Snapshot }) {
  const { products, inventory, saleItems } = snapshot;

  const totalUnits = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = inventory.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + (product?.price ?? 0) * item.quantity;
  }, 0);
  const lowStock = inventory.filter(item => item.quantity <= item.reorderLevel).length;

  const bestSellers = saleItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.productId] = (acc[item.productId] || 0) + item.quantity;
    return acc;
  }, {});

  const topProducts = Object.entries(bestSellers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, qty]) => ({
      product: products.find(p => p.id === productId),
      qty
    }))
    .filter(entry => entry.product);

  return (
    <div>
      <div className="grid">
        <div className="card">
          <h2>Total Products</h2>
          <div>{products.length}</div>
        </div>
        <div className="card">
          <h2>Total Units</h2>
          <div>{totalUnits}</div>
        </div>
        <div className="card">
          <h2>Inventory Value</h2>
          <div>{formatMoney(totalValue)}</div>
        </div>
        <div className="card">
          <h2>Low Stock</h2>
          <div>{lowStock}</div>
        </div>
      </div>

      <div className="section">
        <h3>Best Sellers</h3>
        {topProducts.length === 0 ? (
          <p className="muted">No sales yet.</p>
        ) : (
          <ul>
            {topProducts.map(entry => (
              <li key={entry.product!.id}>
                {entry.product!.name} - {entry.qty} sold
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
