import {
  getAllInventory,
  getAllProducts,
  getAllSaleItems,
  getAllSales,
  getAllStockMovements,
  getInventoryByProduct,
  getProductById,
  putInventory,
  putProduct,
  putSale,
  putSaleItem,
  putStockMovement
} from "./db";
import { queueMutation } from "./sync";
import { Inventory, Product, Sale, SaleItem, StockMovement } from "../types";

export type Snapshot = {
  products: Product[];
  inventory: Inventory[];
  sales: Sale[];
  saleItems: SaleItem[];
  stockMovements: StockMovement[];
};

export async function loadSnapshot(): Promise<Snapshot> {
  const [products, inventory, sales, saleItems, stockMovements] = await Promise.all([
    getAllProducts(),
    getAllInventory(),
    getAllSales(),
    getAllSaleItems(),
    getAllStockMovements()
  ]);

  return { products, inventory, sales, saleItems, stockMovements };
}

export async function upsertProductLocal(input: {
  id?: string;
  name: string;
  barcode?: string | null;
  price: number;
  category?: string | null;
  quantity: number;
  reorderLevel: number;
  createdAt?: string;
  baseInventoryUpdatedAt?: string;
}) {
  const now = new Date().toISOString();
  const product: Product = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    barcode: input.barcode,
    price: input.price,
    category: input.category,
    active: true,
    createdAt: input.createdAt ?? now,
    updatedAt: now
  };

  const inventory: Inventory = {
    productId: product.id,
    quantity: input.quantity,
    reorderLevel: input.reorderLevel,
    updatedAt: now
  };

  await putProduct(product);
  await putInventory(inventory);

  await queueMutation({
    table: "products",
    op: "upsert",
    row: product
  });

  await queueMutation({
    table: "inventory",
    op: "upsert",
    row: {
      ...inventory,
      baseUpdatedAt: input.baseInventoryUpdatedAt
    }
  });

  return { product, inventory };
}

export async function archiveProductLocal(productId: string) {
  const existing = await getProductById(productId);
  if (!existing) {
    return;
  }

  const archivedProduct: Product = {
    ...existing,
    active: false,
    updatedAt: new Date().toISOString()
  };

  await putProduct(archivedProduct);
  await queueMutation({
    table: "products",
    op: "upsert",
    row: archivedProduct
  });
}

export async function recordSaleLocal(input: {
  userId: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  paidAmount: number;
}) {
  const now = new Date().toISOString();
  const saleId = crypto.randomUUID();

  const lineItems: SaleItem[] = input.items.map(item => ({
    id: crypto.randomUUID(),
    saleId,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.quantity * item.unitPrice
  }));

  const stockMovements: StockMovement[] = input.items.map(item => ({
    id: crypto.randomUUID(),
    productId: item.productId,
    userId: input.userId,
    delta: -item.quantity,
    reason: "SALE",
    createdAt: now
  }));

  const total = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const changeAmount = Math.max(0, input.paidAmount - total);

  const sale: Sale = {
    id: saleId,
    userId: input.userId,
    total,
    paidAmount: input.paidAmount,
    changeAmount,
    paymentMethod: "cash",
    createdAt: now
  };

  await putSale(sale);
  for (const item of lineItems) {
    await putSaleItem(item);
  }

  for (const item of lineItems) {
    const current = await getInventoryByProduct(item.productId);
    const updated: Inventory = {
      productId: item.productId,
      quantity: (current?.quantity ?? 0) - item.quantity,
      reorderLevel: current?.reorderLevel ?? 5,
      updatedAt: now
    };
    await putInventory(updated);
  }

  for (const movement of stockMovements) {
    await putStockMovement(movement);
  }

  await queueMutation({
    table: "sales",
    op: "insert",
    row: { sale, items: lineItems, stockMovements }
  });

  return { sale, items: lineItems, stockMovements };
}
