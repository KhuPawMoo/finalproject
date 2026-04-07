import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from "./products.dto";

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async list(query: ListProductsQuery) {
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
        if (!inventory) return false;
        return inventory.quantity <= inventory.reorderLevel;
      });
    }

    return products;
  }

  async create(dto: CreateProductDto) {
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

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { inventory: true }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
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

  async archive(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      throw new NotFoundException("Product not found");
    }

    return this.prisma.product.update({
      where: { id },
      data: { active: false }
    });
  }
}
