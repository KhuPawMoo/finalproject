export type UserRole = "ADMIN" | "STAFF";

export type User = {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  createdAt?: string;
};

export type Session = {
  accessToken: string;
  user: User;
};

export type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  price: number;
  category?: string | null;
  active: boolean;
  createdAt?: string;
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
  table: "products" | "inventory" | "sales";
  op: string;
  row: Record<string, unknown>;
  updatedAt: number;
};

export type SyncConflict = {
  mutationId: string;
  table: string;
  reason: string;
  clientState?: Record<string, unknown>;
  serverState?: Record<string, unknown>;
};

export type ReportSummary = {
  totalSales: number;
  transactions: number;
  averageSale: number;
  bestSellers: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  lowStock: Array<{
    productId: string;
    productName: string;
    quantity: number;
    reorderLevel: number;
  }>;
};

export type TimeseriesPoint = {
  bucket: string;
  total: number;
};
