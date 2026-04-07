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
import { Mutation } from "../types";

const CLIENT_ID_KEY = "inventory.clientId";
const LAST_SYNC_KEY = "inventory.lastSyncAt";

function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

export async function queueMutation(input: Omit<Mutation, "id">) {
  const mutation: Mutation = {
    id: crypto.randomUUID(),
    ...input
  };
  await putMutation(mutation);
  return mutation;
}

export async function syncNow() {
  if (!navigator.onLine) {
    return { status: "offline" as const };
  }

  const clientId = getClientId();
  const lastSyncAt = (await getMeta<string>(LAST_SYNC_KEY)) ?? undefined;
  const mutations = await getMutations();

  const payload = {
    clientId,
    lastSyncAt,
    mutations
  };

  const response = await apiFetch<{
    serverTime: string;
    appliedIds: string[];
    changes: {
      products: any[];
      inventory: any[];
      stockMovements: any[];
      sales: any[];
      saleItems: any[];
    };
  }>("/sync", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  await applyServerChanges(response.changes);
  await setMeta(LAST_SYNC_KEY, response.serverTime);

  for (const id of response.appliedIds) {
    await deleteMutation(id);
  }

  return { status: "ok" as const };
}

async function applyServerChanges(changes: {
  products: any[];
  inventory: any[];
  stockMovements: any[];
  sales: any[];
  saleItems: any[];
}) {
  if (changes.products?.length) await bulkPutProducts(changes.products);
  if (changes.inventory?.length) await bulkPutInventory(changes.inventory);
  if (changes.stockMovements?.length) await bulkPutStockMovements(changes.stockMovements);
  if (changes.sales?.length) await bulkPutSales(changes.sales);
  if (changes.saleItems?.length) await bulkPutSaleItems(changes.saleItems);
}
