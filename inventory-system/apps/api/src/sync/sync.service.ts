import { Injectable } from "@nestjs/common";
import { Prisma, StockReason } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MutationDto, SyncRequestDto } from "./sync.dto";

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  async sync(payload: SyncRequestDto) {
    const appliedIds: string[] = [];

    for (const mutation of payload.mutations) {
      await this.applyMutation(mutation);
      appliedIds.push(mutation.id);
    }

    const since = payload.lastSyncAt ? new Date(payload.lastSyncAt) : new Date(0);
    const changes = await this.getChangesSince(since);

    return {
      serverTime: new Date().toISOString(),
      appliedIds,
      changes
    };
  }

  private async applyMutation(mutation: MutationDto) {
    if (!mutation.row) return;

    switch (mutation.table) {
      case "products":
        return this.upsertProduct(mutation.row);
      case "inventory":
        return this.upsertInventory(mutation.row);
      case "stock_movements":
        return this.insertStockMovement(mutation.row);
      case "sales":
        return this.insertSale(mutation.row);
      default:
        return;
    }
  }

  private async upsertProduct(row: Record<string, unknown>) {
    const data = row as Prisma.ProductCreateInput & { id?: string; updatedAt?: string };
    const id = data.id ?? randomUUID();

    await this.prisma.product.upsert({
      where: { id },
      update: {
        name: data.name,
        barcode: data.barcode,
        price: data.price,
        category: data.category,
        active: data.active ?? true,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      },
      create: {
        id,
        name: data.name,
        barcode: data.barcode,
        price: data.price,
        category: data.category,
        active: data.active ?? true
      }
    });

    await this.prisma.inventory.upsert({
      where: { productId: id },
      update: {},
      create: { productId: id, quantity: 0, reorderLevel: 5 }
    });
  }

  private async upsertInventory(row: Record<string, unknown>) {
    const data = row as { productId: string; quantity: number; reorderLevel?: number; updatedAt?: string };

    await this.prisma.inventory.upsert({
      where: { productId: data.productId },
      update: {
        quantity: data.quantity,
        reorderLevel: data.reorderLevel ?? 5,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined
      },
      create: {
        productId: data.productId,
        quantity: data.quantity,
        reorderLevel: data.reorderLevel ?? 5
      }
    });
  }

  private async insertStockMovement(row: Record<string, unknown>) {
    const data = row as { id?: string; productId: string; userId?: string; delta: number; reason?: StockReason; createdAt?: string };
    const id = data.id ?? randomUUID();

    await this.prisma.$transaction(async trx => {
      await trx.stockMovement.create({
        data: {
          id,
          productId: data.productId,
          userId: data.userId,
          delta: data.delta,
          reason: data.reason ?? StockReason.ADJUSTMENT,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
        }
      });

      await trx.inventory.upsert({
        where: { productId: data.productId },
        update: { quantity: { increment: data.delta } },
        create: { productId: data.productId, quantity: data.delta, reorderLevel: 5 }
      });
    });
  }

  private async insertSale(row: Record<string, unknown>) {
    const data = row as {
      sale: {
        id?: string;
        userId: string;
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
    };

    const saleId = data.sale.id ?? randomUUID();

    await this.prisma.$transaction(async trx => {
      await trx.sale.upsert({
        where: { id: saleId },
        update: {
          total: data.sale.total,
          paidAmount: data.sale.paidAmount,
          changeAmount: data.sale.changeAmount
        },
        create: {
          id: saleId,
          userId: data.sale.userId,
          total: data.sale.total,
          paidAmount: data.sale.paidAmount,
          changeAmount: data.sale.changeAmount,
          paymentMethod: "cash",
          createdAt: data.sale.createdAt ? new Date(data.sale.createdAt) : new Date()
        }
      });

      if (data.items?.length) {
        await trx.saleItem.createMany({
          data: data.items.map(item => ({
            id: item.id ?? randomUUID(),
            saleId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal
          })),
          skipDuplicates: true
        });

        for (const item of data.items) {
          await trx.inventory.upsert({
            where: { productId: item.productId },
            update: { quantity: { decrement: item.quantity } },
            create: { productId: item.productId, quantity: -item.quantity, reorderLevel: 5 }
          });
        }
      }
    });
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
        where: { sale: { createdAt: { gt: since } } }
      })
    ]);

    return {
      products: products.map(product => ({
        ...product,
        price: Number(product.price),
        inventory: product.inventory
          ? {
              ...product.inventory,
              updatedAt: product.inventory.updatedAt.toISOString()
            }
          : null,
        updatedAt: product.updatedAt.toISOString()
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
