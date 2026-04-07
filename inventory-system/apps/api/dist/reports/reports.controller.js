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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../common/auth.guard");
const roles_1 = require("../common/roles");
const reports_service_1 = require("./reports.service");
let ReportsController = class ReportsController {
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    summary(from, to) {
        const end = to ? new Date(to) : new Date();
        const start = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
        return this.reportsService.summary(start, end);
    }
    timeseries(from, to, bucket) {
        const end = to ? new Date(to) : new Date();
        const start = from ? new Date(from) : new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
        return this.reportsService.timeseries(start, end, bucket ?? "day");
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)("summary"),
    __param(0, (0, common_1.Query)("from")),
    __param(1, (0, common_1.Query)("to")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)("timeseries"),
    __param(0, (0, common_1.Query)("from")),
    __param(1, (0, common_1.Query)("to")),
    __param(2, (0, common_1.Query)("bucket")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "timeseries", null);
exports.ReportsController = ReportsController = __decorate([
    (0, common_1.Controller)("reports"),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_1.RolesGuard),
    (0, roles_1.Roles)("ADMIN"),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map