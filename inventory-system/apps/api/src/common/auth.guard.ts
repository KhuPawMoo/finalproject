import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "./roles";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = String(request.headers.authorization || "");
    const [, token] = authHeader.split(" ");

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser & { sub: string }>(token, {
        secret: process.env.JWT_SECRET || "inventory-dev-secret"
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub }
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      } satisfies AuthenticatedUser;

      return true;
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
