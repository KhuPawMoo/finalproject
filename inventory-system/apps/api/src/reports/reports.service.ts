import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async summary(from: Date, to: Date) {
    const totals = await this.prisma.sale.aggregate({
      _sum: { total: true, paidAmount: true },
      _avg: { total: true },
      _count: { id: true },
      where: { createdAt: { gte: from, lte: to } }
    });

    const groupedTopProducts = await this.prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, lineTotal: true },
      where: { sale: { is: { createdAt: { gte: from, lte: to } } } },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10
    });

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: groupedTopProducts.map(item => item.productId) }
      }
    });

    const lowStock = await this.prisma.inventory.findMany({
      include: {
        product: true
      },
      orderBy: { quantity: "asc" },
      take: 25
    });

    return {
      totalSales: Number(totals._sum.total || 0),
      cashCollected: Number(totals._sum.paidAmount || 0),
      averageSale: Number(totals._avg.total || 0),
      transactions: totals._count.id || 0,
      bestSellers: groupedTopProducts.map(item => ({
        productId: item.productId,
        productName: products.find(product => product.id === item.productId)?.name || "Unknown product",
        quantity: item._sum.quantity || 0,
        revenue: Number(item._sum.lineTotal || 0)
      })),
      lowStock: lowStock
        .filter(item => item.quantity <= item.reorderLevel)
        .slice(0, 10)
        .map(item => ({
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          reorderLevel: item.reorderLevel
        }))
    };
  }

  async timeseries(from: Date, to: Date, bucket: "day" | "week" | "month") {
    const interval = bucket === "week" ? "week" : bucket === "month" ? "month" : "day";

    const result = await this.prisma.$queryRaw<
      Array<{ bucket: Date; total: number }>
    >`
      select date_trunc(${interval}, "createdAt") as bucket,
             sum("total")::float as total
      from "Sale"
      where "createdAt" between ${from} and ${to}
      group by bucket
      order by bucket asc
    `;

    return result.map(row => ({
      bucket: row.bucket.toISOString(),
      total: Number(row.total)
    }));
  }
}
