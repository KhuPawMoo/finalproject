"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ReportsService = class ReportsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async summary(from, to) {
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
    async timeseries(from, to, bucket) {
        const interval = bucket === "week" ? "week" : bucket === "month" ? "month" : "day";
        const result = await this.prisma.$queryRaw `
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
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map