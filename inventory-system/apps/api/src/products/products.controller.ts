import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Roles, RolesGuard } from "../common/roles";
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from "./products.dto";
import { ProductsService } from "./products.service";

@Controller("products")
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.productsService.list(query);
  }

  @Post()
  @Roles("ADMIN")
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Put(":id")
  @Roles("ADMIN")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(":id")
  @Roles("ADMIN")
  archive(@Param("id") id: string) {
    return this.productsService.archive(id);
  }
}
