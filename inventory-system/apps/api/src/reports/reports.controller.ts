import { Controller, Get, Query } from "@nestjs/common";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("summary")
  summary(@Query("from") from?: string, @Query("to") to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    return this.reportsService.summary(start, end);
  }

  @Get("timeseries")
  timeseries(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("bucket") bucket?: "day" | "week" | "month"
  ) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
    return this.reportsService.timeseries(start, end, bucket ?? "day");
  }
}
