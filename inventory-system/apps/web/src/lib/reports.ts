import { Snapshot } from "./data";

function bucketLabel(value: string) {
  return new Date(value).toLocaleDateString("en-CA");
}

export function summarizeSnapshot(snapshot: Snapshot, rangeDays: number) {
  const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const filteredSales = snapshot.sales.filter(sale => new Date(sale.createdAt).getTime() >= cutoff);
  const filteredSaleIds = new Set(filteredSales.map(sale => sale.id));
  const filteredItems = snapshot.saleItems.filter(item => filteredSaleIds.has(item.saleId));

  const totalSales = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const transactions = filteredSales.length;
  const averageSale = transactions ? totalSales / transactions : 0;

  const sellerMap = filteredItems.reduce<Record<string, { quantity: number; revenue: number }>>((acc, item) => {
    const current = acc[item.productId] || { quantity: 0, revenue: 0 };
    current.quantity += item.quantity;
    current.revenue += item.lineTotal;
    acc[item.productId] = current;
    return acc;
  }, {});

  const bestSellers = Object.entries(sellerMap)
    .map(([productId, metrics]) => ({
      productId,
      productName: snapshot.products.find(product => product.id === productId)?.name || "Unknown product",
      quantity: metrics.quantity,
      revenue: metrics.revenue
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const lowStock = snapshot.inventory
    .filter(item => item.quantity <= item.reorderLevel)
    .map(item => ({
      productId: item.productId,
      productName: snapshot.products.find(product => product.id === item.productId)?.name || "Unknown product",
      quantity: item.quantity,
      reorderLevel: item.reorderLevel
    }))
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 10);

  const seriesMap = filteredSales.reduce<Record<string, number>>((acc, sale) => {
    const key = bucketLabel(sale.createdAt);
    acc[key] = (acc[key] || 0) + sale.total;
    return acc;
  }, {});

  const series = Object.entries(seriesMap)
    .map(([bucket, total]) => ({ bucket, total }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  return {
    totalSales,
    transactions,
    averageSale,
    bestSellers,
    lowStock,
    series
  };
}

export function rollingTotals(snapshot: Snapshot) {
  return {
    today: summarizeSnapshot(snapshot, 1),
    week: summarizeSnapshot(snapshot, 7),
    month: summarizeSnapshot(snapshot, 30)
  };
}
