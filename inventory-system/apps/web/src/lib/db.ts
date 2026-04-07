import { Inventory, Mutation, Product, Sale, SaleItem, StockMovement } from "../types";

const DB_NAME = "inventory-db";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
      if (!db.objectStoreNames.contains("inventory")) db.createObjectStore("inventory", { keyPath: "productId" });
      if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "id" });
      if (!db.objectStoreNames.contains("saleItems")) db.createObjectStore("saleItems", { keyPath: "id" });
      if (!db.objectStoreNames.contains("stockMovements")) db.createObjectStore("stockMovements", { keyPath: "id" });
      if (!db.objectStoreNames.contains("mutations")) db.createObjectStore("mutations", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllProducts(): Promise<Product[]> {
  return withStore("products", "readonly", store => store.getAll());
}

export async function getAllInventory(): Promise<Inventory[]> {
  return withStore("inventory", "readonly", store => store.getAll());
}

export async function getAllSales(): Promise<Sale[]> {
  return withStore("sales", "readonly", store => store.getAll());
}

export async function getAllSaleItems(): Promise<SaleItem[]> {
  return withStore("saleItems", "readonly", store => store.getAll());
}

export async function putProduct(product: Product) {
  return withStore("products", "readwrite", store => store.put(product));
}

export async function putInventory(item: Inventory) {
  return withStore("inventory", "readwrite", store => store.put(item));
}

export async function putSale(sale: Sale) {
  return withStore("sales", "readwrite", store => store.put(sale));
}

export async function putSaleItem(item: SaleItem) {
  return withStore("saleItems", "readwrite", store => store.put(item));
}

export async function putStockMovement(item: StockMovement) {
  return withStore("stockMovements", "readwrite", store => store.put(item));
}

export async function deleteProduct(id: string) {
  return withStore("products", "readwrite", store => store.delete(id));
}

export async function getInventoryByProduct(productId: string): Promise<Inventory | undefined> {
  return withStore("inventory", "readonly", store => store.get(productId));
}

export async function setMeta<T>(key: string, value: T) {
  return withStore("meta", "readwrite", store => store.put({ key, value }));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const result = await withStore<{ key: string; value: T } | undefined>("meta", "readonly", store => store.get(key));
  return result?.value;
}

export async function getMutations(): Promise<Mutation[]> {
  return withStore("mutations", "readonly", store => store.getAll());
}

export async function putMutation(mutation: Mutation) {
  return withStore("mutations", "readwrite", store => store.put(mutation));
}

export async function deleteMutation(id: string) {
  return withStore("mutations", "readwrite", store => store.delete(id));
}

export async function bulkPutProducts(items: Product[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("products", "readwrite");
    const store = tx.objectStore("products");
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function bulkPutInventory(items: Inventory[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("inventory", "readwrite");
    const store = tx.objectStore("inventory");
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function bulkPutSales(items: Sale[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("sales", "readwrite");
    const store = tx.objectStore("sales");
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function bulkPutSaleItems(items: SaleItem[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("saleItems", "readwrite");
    const store = tx.objectStore("saleItems");
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function bulkPutStockMovements(items: StockMovement[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("stockMovements", "readwrite");
    const store = tx.objectStore("stockMovements");
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
