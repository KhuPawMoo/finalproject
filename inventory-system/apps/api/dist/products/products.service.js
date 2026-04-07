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
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ProductsService = class ProductsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(query) {
        const search = query.search?.trim();
        const category = query.category?.trim();
        const products = await this.prisma.product.findMany({
            where: {
                active: true,
                ...(search
                    ? {
                        OR: [
                            { name: { contains: search, mode: "insensitive" } },
                            { barcode: { contains: search, mode: "insensitive" } }
                        ]
                    }
                    : {}),
                ...(category ? { category } : {})
            },
            include: { inventory: true },
            orderBy: { updatedAt: "desc" }
        });
        if (query.lowOnly) {
            return products.filter(product => {
                const inventory = product.inventory;
                if (!inventory)
                    return false;
                return inventory.quantity <= inventory.reorderLevel;
            });
        }
        return products;
    }
    async create(dto) {
        const product = await this.prisma.product.create({
            data: {
                name: dto.name,
                barcode: dto.barcode,
                price: dto.price,
                category: dto.category
            }
        });
        await this.prisma.inventory.upsert({
            where: { productId: product.id },
            update: {
                quantity: dto.quantity ?? 0,
                reorderLevel: dto.reorderLevel ?? 5
            },
            create: {
                productId: product.id,
                quantity: dto.quantity ?? 0,
                reorderLevel: dto.reorderLevel ?? 5
            }
        });
        return this.prisma.product.findUnique({
            where: { id: product.id },
            include: { inventory: true }
        });
    }
    async update(id, dto) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: { inventory: true }
        });
        if (!product) {
            throw new common_1.NotFoundException("Product not found");
        }
        await this.prisma.product.update({
            where: { id },
            data: {
                name: dto.name ?? product.name,
                barcode: dto.barcode ?? product.barcode,
                price: dto.price ?? product.price,
                category: dto.category ?? product.category,
                active: dto.active ?? product.active
            }
        });
        if (dto.quantity !== undefined || dto.reorderLevel !== undefined) {
            await this.prisma.inventory.upsert({
                where: { productId: id },
                update: {
                    quantity: dto.quantity ?? product.inventory?.quantity ?? 0,
                    reorderLevel: dto.reorderLevel ?? product.inventory?.reorderLevel ?? 5
                },
                create: {
                    productId: id,
                    quantity: dto.quantity ?? 0,
                    reorderLevel: dto.reorderLevel ?? 5
                }
            });
        }
        return this.prisma.product.findUnique({
            where: { id },
            include: { inventory: true }
        });
    }
    async archive(id) {
        const product = await this.prisma.product.findUnique({
            where: { id }
        });
        if (!product) {
            throw new common_1.NotFoundException("Product not found");
        }
        return this.prisma.product.update({
            where: { id },
            data: { active: false }
        });
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ProductsService);
//# sourceMappingURL=products.service.js.map