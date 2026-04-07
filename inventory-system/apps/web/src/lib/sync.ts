import { apiFetch } from "./api";
import {
  bulkPutInventory,
  bulkPutProducts,
  bulkPutSaleItems,
  bulkPutSales,
  bulkPutStockMovements,
  deleteMutation,
  getMeta,
  getMutations,
  putMutation,
  setMeta
} from "./db";
import { getSession } from "./session";
import { Mutation, SyncConflict } from "../types";

const CLIENT_ID_KEY = "inventory.clientId";
const LAST_SYNC_KEY = "inventory.lastSyncAt";

function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export async function queueMutation(input: Omit<Mutation, "id" | "updatedAt"> & { updatedAt?: number }) {
  const mutation: Mutation = {
    id: crypto.randomUUID(),
    updatedAt: input.updatedAt ?? Date.now(),
    ...input
  };
  await putMutation(mutation);
  return mutation;
}

export async function syncNow() {
  const session = getSession();
  if (!session) {
    return { status: "unauthenticated" as const, conflicts: [] as SyncConflict[] };
  }

  if (!navigator.onLine) {
    return { status: "offline" as const, conflicts: [] as SyncConflict[] };
  }

  const clientId = getClientId();
  const lastSyncAt = (await getMeta<string>(LAST_SYNC_KEY)) ?? undefined;
  const mutations = (await getMutations()).sort((a, b) => a.updatedAt - b.updatedAt);

  try {
    const response = await apiFetch<{
      serverTime: string;
      appliedIds: string[];
      conflicts: SyncConflict[];
      changes: {
        products: any[];
        inventory: any[];
        stockMovements: any[];
        sales: any[];
        saleItems: any[];
      };
    }>("/sync", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        lastSyncAt,
        mutations
      })
    });

    await applyServerChanges(response.changes);
    await setMeta(LAST_SYNC_KEY, response.serverTime);

    for (const id of response.appliedIds) {
      await deleteMutation(id);
    }

    return { status: "ok" as const, conflicts: response.conflicts };
  } catch (error) {
    return {
      status: "error" as const,
      conflicts: [] as SyncConflict[],
      error: error instanceof Error ? error.message : "Sync failed"
    };
  }
}

async function applyServerChanges(changes: {
  products: any[];
  inventory: any[];
  stockMovements: any[];
  sales: any[];
  saleItems: any[];
}) {
  if (changes.products?.length) {
    await bulkPutProducts(changes.products);
  }
  if (changes.inventory?.length) {
    await bulkPutInventory(changes.inventory);
  }
  if (changes.stockMovements?.length) {
    await bulkPutStockMovements(changes.stockMovements);
  }
  if (changes.sales?.length) {
    await bulkPutSales(changes.sales);
  }
  if (changes.saleItems?.length) {
    await bulkPutSaleItems(changes.saleItems);
  }
}
