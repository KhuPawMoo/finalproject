import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async resetData(currentUserId: string) {
    return this.prisma.$transaction(async trx => {
      const saleItemsDeleted = await trx.saleItem.deleteMany();
      const stockMovesDeleted = await trx.stockMovement.deleteMany();
      const salesDeleted = await trx.sale.deleteMany();
      const inventoryDeleted = await trx.inventory.deleteMany();
      const productsDeleted = await trx.product.deleteMany();
      const usersDeleted = await trx.user.deleteMany({
        where: {
          id: { not: currentUserId }
        }
      });

      const resetEvent = await trx.resetEvent.create({
        data: {
          initiatedById: currentUserId
        }
      });

      return {
        resetAt: resetEvent.createdAt.toISOString(),
        deleted: {
          sales: salesDeleted.count,
          saleItems: saleItemsDeleted.count,
          stockMovements: stockMovesDeleted.count,
          inventory: inventoryDeleted.count,
          products: productsDeleted.count,
          users: usersDeleted.count
        }
      };
    });
  }
}
