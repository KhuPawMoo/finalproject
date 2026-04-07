import { Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/auth.guard";
import { CurrentUser } from "../common/current-user";
import { AuthenticatedUser, Roles, RolesGuard } from "../common/roles";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("reset-data")
  resetData(@CurrentUser() user: AuthenticatedUser) {
    return this.adminService.resetData(user.id);
  }
}
