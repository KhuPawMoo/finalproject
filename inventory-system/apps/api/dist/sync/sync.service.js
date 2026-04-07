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
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
let SyncService = class SyncService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async sync(payload, user) {
        const appliedIds = [];
        const conflicts = [];
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
        const latestReset = await this.prisma.resetEvent.findFirst({
            orderBy: { createdAt: "desc" }
        });
        return {
            serverTime: new Date().toISOString(),
            resetAt: latestReset?.createdAt.toISOString() ?? null,
            appliedIds,
            conflicts,
            changes
        };
    }
    async applyMutation(mutation, user) {
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
    async upsertProduct(mutation) {
        const row = mutation.row;
        const id = row.id ?? (0, crypto_1.randomUUID)();
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
    async reconcileInventory(mutation, user) {
        const row = mutation.row;
        const current = await this.prisma.inventory.findUnique({
            where: { productId: row.productId }
        });
        const baseUpdatedAt = row.baseUpdatedAt ? new Date(row.baseUpdatedAt) : undefined;
        if (current &&
            baseUpdatedAt &&
            current.updatedAt.getTime() > baseUpdatedAt.getTime() &&
            current.quantity !== row.quantity) {
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
        await this.prisma.$transaction(async (trx) => {
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
                        reason: client_1.StockReason.ADJUSTMENT,
                        createdAt: row.updatedAt ? new Date(row.updatedAt) : new Date()
                    }
                });
            }
        });
        return { status: "applied" };
    }
    async insertSale(mutation, user) {
        const row = mutation.row;
        const saleId = row.sale.id ?? (0, crypto_1.randomUUID)();
        const existing = await this.prisma.sale.findUnique({
            where: { id: saleId }
        });
        if (existing) {
            return { status: "ignored" };
        }
        await this.prisma.$transaction(async (trx) => {
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
                        id: item.id ?? (0, crypto_1.randomUUID)(),
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
                    id: item.id ?? (0, crypto_1.randomUUID)(),
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
                        reason: client_1.StockReason.SALE,
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
    async getChangesSince(since) {
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
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SyncService);
//# sourceMappingURL=sync.service.js.map