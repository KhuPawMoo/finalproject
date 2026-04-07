export type UserRole = "ADMIN" | "STAFF";

export type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  price: number;
  category?: string | null;
  active: boolean;
  updatedAt: string;
};

export type Inventory = {
  productId: string;
  quantity: number;
  reorderLevel: number;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  productId: string;
  userId?: string | null;
  delta: number;
  reason: "SALE" | "RESTOCK" | "ADJUSTMENT";
  createdAt: string;
};

export type Sale = {
  id: string;
  userId: string;
  total: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod: "cash";
  createdAt: string;
};

export type SaleItem = {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Mutation = {
  id: string;
  table: string;
  op: string;
  row: Record<string, unknown>;
  updatedAt?: number;
};
