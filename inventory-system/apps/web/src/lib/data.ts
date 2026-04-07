import {
  getAllInventory,
  getAllProducts,
  getAllSaleItems,
  getAllSales,
  getInventoryByProduct,
  putInventory,
  putProduct,
  putSale,
  putSaleItem,
  putStockMovement,
  deleteProduct
} from "./db";
import { queueMutation } from "./sync";
import { Inventory, Product, Sale, SaleItem, StockMovement } from "../types";

export type Snapshot = {
  products: Product[];
  inventory: Inventory[];
  sales: Sale[];
  saleItems: SaleItem[];
};

export async function loadSnapshot(): Promise<Snapshot> {
  const [products, inventory, sales, saleItems] = await Promise.all([
    getAllProducts(),
    getAllInventory(),
    getAllSales(),
    getAllSaleItems()
  ]);
  return { products, inventory, sales, saleItems };
}

export async function upsertProductLocal(input: {
  id?: string;
  name: string;
  barcode?: string | null;
  price: number;
  category?: string | null;
  quantity: number;
  reorderLevel: number;
}) {
  const now = new Date().toISOString();
  const product: Product = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    barcode: input.barcode,
    price: input.price,
    category: input.category,
    active: true,
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
    row: product,
    updatedAt: Date.now()
  });

  await queueMutation({
    table: "inventory",
    op: "upsert",
    row: inventory,
    updatedAt: Date.now()
  });

  return { product, inventory };
}

export async function archiveProductLocal(productId: string) {
  await deleteProduct(productId);
  await queueMutation({
    table: "products",
    op: "upsert",
    row: { id: productId, active: false, updatedAt: new Date().toISOString() },
    updatedAt: Date.now()
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

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      productId: item.productId,
      userId: input.userId,
      delta: -item.quantity,
      reason: "SALE",
      createdAt: now
    };
    await putStockMovement(movement);

    await queueMutation({
      table: "stock_movements",
      op: "insert",
      row: movement
    });
  }

  await queueMutation({
    table: "sales",
    op: "insert",
    row: { sale, items: lineItems }
  });

  return { sale, items: lineItems };
}
