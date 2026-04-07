import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword, verifyPassword } from "../common/password";
import { BootstrapAdminDto, LoginDto } from "./auth.dto";

type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: Role;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async setupStatus() {
    const count = await this.prisma.user.count();
    return { needsSetup: count === 0 };
  }

  async bootstrapAdmin(dto: BootstrapAdminDto): Promise<AuthResponse> {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      throw new ConflictException("Admin account already exists");
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        passwordHash: await hashPassword(dto.password),
        name: dto.name?.trim() || "Owner",
        role: Role.ADMIN
      }
    });

    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const isValid = await verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.issueToken(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return this.serializeUser(user);
  }

  private async issueToken(user: User): Promise<AuthResponse> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET || "inventory-dev-secret",
      expiresIn: "30d"
    });

    return {
      accessToken,
      user: this.serializeUser(user)
    };
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
  }
}
