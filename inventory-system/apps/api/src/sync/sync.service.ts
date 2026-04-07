import { Injectable } from "@nestjs/common";
import { StockReason } from "@prisma/client";
import { randomUUID } from "crypto";
import { AuthenticatedUser } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";
import { MutationDto, SyncRequestDto } from "./sync.dto";

type SyncConflict = {
  mutationId: string;
  table: string;
  reason: string;
  clientState?: Record<string, unknown>;
  serverState?: Record<string, unknown>;
};

type ApplyResult =
  | { status: "applied" }
  | { status: "ignored" }
  | { status: "conflict"; conflict: SyncConflict };

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(payload: SyncRequestDto, user: AuthenticatedUser) {
    const appliedIds: string[] = [];
    const conflicts: SyncConflict[] = [];

    for (const mutation of payload.mutations) {
      const result = await this.applyMutation(mutation, user);
      if (result.status === "applied" || result.status === "ignored") {
        appliedIds.push(mutation.id);
      }
      if (result.status === "conflict") {
        conflicts.push(result.conflict);
      }
    }

    const since = payload.lastSyncAt ? new Date(payload.lastSyncAt) : new Date(0);
    const changes = await this.getChangesSince(since);

    return {
      serverTime: new Date().toISOString(),
      appliedIds,
      conflicts,
      changes
    };
  }

  private async applyMutation(mutation: MutationDto, user: AuthenticatedUser): Promise<ApplyResult> {
    if (!mutation.row) {
      return { status: "ignored" };
    }

    switch (mutation.table) {
      case "products":
        return this.upsertProduct(mutation);
      case "inventory":
        return this.reconcileInventory(mutation, user);
      case "sales":
        return this.insertSale(mutation, user);
      default:
        return { status: "ignored" };
    }
  }

  private async upsertProduct(mutation: MutationDto): Promise<ApplyResult> {
    const row = mutation.row as {
      id?: string;
      name?: string;
      barcode?: string | null;
      price?: number;
      category?: string | null;
      active?: boolean;
      updatedAt?: string;
    };
    const id = row.id ?? randomUUID();
    const existing = await this.prisma.product.findUnique({
      where: { id }
    });
    const incomingUpdatedAt = row.updatedAt ? new Date(row.updatedAt) : new Date();

    if (!existing) {
      if (!row.name || row.price === undefined) {
        return {
          status: "conflict",
          conflict: {
            mutationId: mutation.id,
            table: mutation.table,
            reason: "Product creation payload is incomplete",
            clientState: mutation.row
          }
        };
      }

      await this.prisma.product.create({
        data: {
          id,
          name: row.name,
          barcode: row.barcode,
          price: row.price,
          category: row.category,
          active: row.active ?? true,
          updatedAt: incomingUpdatedAt
        }
      });

      await this.prisma.inventory.upsert({
        where: { productId: id },
        update: {},
        create: { productId: id, quantity: 0, reorderLevel: 5 }
      });

      return { status: "applied" };
    }

    if (row.updatedAt && existing.updatedAt.getTime() > incomingUpdatedAt.getTime()) {
      return { status: "ignored" };
    }

    await this.prisma.product.update({
      where: { id },
      data: {
        name: row.name ?? existing.name,
        barcode: row.barcode === undefined ? existing.barcode : row.barcode,
        price: row.price ?? existing.price,
        category: row.category === undefined ? existing.category : row.category,
        active: row.active ?? existing.active,
        updatedAt: incomingUpdatedAt
      }
    });

    return { status: "applied" };
  }

  private async reconcileInventory(mutation: MutationDto, user: AuthenticatedUser): Promise<ApplyResult> {
    const row = mutation.row as {
      productId: string;
      quantity: number;
      reorderLevel: number;
      baseUpdatedAt?: string;
      updatedAt?: string;
    };

    const current = await this.prisma.inventory.findUnique({
      where: { productId: row.productId }
    });
    const baseUpdatedAt = row.baseUpdatedAt ? new Date(row.baseUpdatedAt) : undefined;

    if (
      current &&
      baseUpdatedAt &&
      current.updatedAt.getTime() > baseUpdatedAt.getTime() &&
      current.quantity !== row.quantity
    ) {
      return {
        status: "conflict",
        conflict: {
          mutationId: mutation.id,
          table: mutation.table,
          reason: "Inventory changed on another device before this edit synced",
          clientState: mutation.row,
          serverState: {
            productId: current.productId,
            quantity: current.quantity,
            reorderLevel: current.reorderLevel,
            updatedAt: current.updatedAt.toISOString()
          }
        }
      };
    }

    const previousQuantity = current?.quantity ?? 0;
    const delta = row.quantity - previousQuantity;

    await this.prisma.$transaction(async trx => {
      await trx.inventory.upsert({
        where: { productId: row.productId },
        update: {
          quantity: row.quantity,
          reorderLevel: row.reorderLevel,
          updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined
        },
        create: {
          productId: row.productId,
          quantity: row.quantity,
          reorderLevel: row.reorderLevel,
          updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined
        }
      });

      if (delta !== 0) {
        await trx.stockMovement.create({
          data: {
            id: mutation.id,
            productId: row.productId,
            userId: user.id,
            delta,
            reason: StockReason.ADJUSTMENT,
            createdAt: row.updatedAt ? new Date(row.updatedAt) : new Date()
          }
        });
      }
    });

    return { status: "applied" };
  }

  private async insertSale(mutation: MutationDto, user: AuthenticatedUser): Promise<ApplyResult> {
    const row = mutation.row as {
      sale: {
        id?: string;
        total: number;
        paidAmount: number;
        changeAmount: number;
        createdAt?: string;
      };
      items: Array<{
        id?: string;
        productId: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }>;
      stockMovements?: Array<{
        id: string;
        productId: string;
        delta: number;
        createdAt?: string;
      }>;
    };
    const saleId = row.sale.id ?? randomUUID();

    const existing = await this.prisma.sale.findUnique({
      where: { id: saleId }
    });
    if (existing) {
      return { status: "ignored" };
    }

    await this.prisma.$transaction(async trx => {
      await trx.sale.create({
        data: {
          id: saleId,
          userId: user.id,
          total: row.sale.total,
          paidAmount: row.sale.paidAmount,
          changeAmount: row.sale.changeAmount,
          paymentMethod: "cash",
          createdAt: row.sale.createdAt ? new Date(row.sale.createdAt) : new Date()
        }
      });

      if (row.items.length) {
        await trx.saleItem.createMany({
          data: row.items.map(item => ({
            id: item.id ?? randomUUID(),
            saleId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal
          })),
          skipDuplicates: true
        });
      }

      const movements = row.stockMovements?.length
        ? row.stockMovements
        : row.items.map(item => ({
            id: item.id ?? randomUUID(),
            productId: item.productId,
            delta: -item.quantity,
            createdAt: row.sale.createdAt
          }));

      for (const movement of movements) {
        await trx.stockMovement.create({
          data: {
            id: movement.id,
            productId: movement.productId,
            userId: user.id,
            delta: movement.delta,
            reason: StockReason.SALE,
            createdAt: movement.createdAt ? new Date(movement.createdAt) : new Date()
          }
        });
      }

      for (const item of row.items) {
        await trx.inventory.upsert({
          where: { productId: item.productId },
          update: { quantity: { decrement: item.quantity } },
          create: { productId: item.productId, quantity: -item.quantity, reorderLevel: 5 }
        });
      }
    });

    return { status: "applied" };
  }

  private async getChangesSince(since: Date) {
    const [products, inventory, stockMoves, sales, saleItems] = await Promise.all([
      this.prisma.product.findMany({
        where: { updatedAt: { gt: since } },
        include: { inventory: true }
      }),
      this.prisma.inventory.findMany({
        where: { updatedAt: { gt: since } }
      }),
      this.prisma.stockMovement.findMany({
        where: { createdAt: { gt: since } }
      }),
      this.prisma.sale.findMany({
        where: { createdAt: { gt: since } }
      }),
      this.prisma.saleItem.findMany({
        where: { sale: { is: { createdAt: { gt: since } } } }
      })
    ]);

    return {
      products: products.map(product => ({
        ...product,
        price: Number(product.price),
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
        inventory: product.inventory
          ? {
              ...product.inventory,
              updatedAt: product.inventory.updatedAt.toISOString()
            }
          : null
      })),
      inventory: inventory.map(item => ({
        ...item,
        updatedAt: item.updatedAt.toISOString()
      })),
      stockMovements: stockMoves.map(item => ({
        ...item,
        createdAt: item.createdAt.toISOString()
      })),
      sales: sales.map(item => ({
        ...item,
        total: Number(item.total),
        paidAmount: Number(item.paidAmount),
        changeAmount: Number(item.changeAmount),
        createdAt: item.createdAt.toISOString()
      })),
      saleItems: saleItems.map(item => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal)
      }))
    };
  }
}
