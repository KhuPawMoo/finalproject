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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const password_1 = require("../common/password");
let AuthService = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async setupStatus() {
        const count = await this.prisma.user.count();
        return { needsSetup: count === 0 };
    }
    async bootstrapAdmin(dto) {
        const userCount = await this.prisma.user.count();
        if (userCount > 0) {
            throw new common_1.ConflictException("Admin account already exists");
        }
        const user = await this.prisma.user.create({
            data: {
                email: dto.email.trim().toLowerCase(),
                passwordHash: await (0, password_1.hashPassword)(dto.password),
                name: dto.name?.trim() || "Owner",
                role: client_1.Role.ADMIN
            }
        });
        return this.issueToken(user);
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.trim().toLowerCase() }
        });
        if (!user) {
            throw new common_1.UnauthorizedException("Invalid email or password");
        }
        const isValid = await (0, password_1.verifyPassword)(dto.password, user.passwordHash);
        if (!isValid) {
            throw new common_1.UnauthorizedException("Invalid email or password");
        }
        return this.issueToken(user);
    }
    async me(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            throw new common_1.UnauthorizedException("User not found");
        }
        return this.serializeUser(user);
    }
    async issueToken(user) {
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
    serializeUser(user) {
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map