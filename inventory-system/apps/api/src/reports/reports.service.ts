import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async summary(from: Date, to: Date) {
    const totals = await this.prisma.sale.aggregate({
      _sum: { total: true },
      _count: { id: true },
      where: { createdAt: { gte: from, lte: to } }
    });

    const topProducts = await this.prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, lineTotal: true },
      where: { sale: { createdAt: { gte: from, lte: to } } },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10
    });

    return {
      totalSales: Number(totals._sum.total || 0),
      transactions: totals._count.id || 0,
      topProducts
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
