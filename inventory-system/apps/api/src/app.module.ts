import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsModule } from "./products/products.module";
import { ReportsModule } from "./reports/reports.module";
import { SyncModule } from "./sync/sync.module";

@Module({
  imports: [PrismaModule, ProductsModule, ReportsModule, SyncModule]
})
export class AppModule {}
