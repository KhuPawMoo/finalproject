import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user";
import { AuthenticatedUser } from "../common/roles";
import { SyncRequestDto } from "./sync.dto";
import { SyncService } from "./sync.service";

@Controller("sync")
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  sync(@Body() payload: SyncRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.syncService.sync(payload, user);
  }
}
