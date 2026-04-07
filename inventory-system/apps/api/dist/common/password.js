"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const bcryptjs_1 = require("bcryptjs");
const SALT_ROUNDS = 10;
async function hashPassword(password) {
    return (0, bcryptjs_1.hash)(password, SALT_ROUNDS);
}
async function verifyPassword(password, passwordHash) {
    return (0, bcryptjs_1.compare)(password, passwordHash);
}
//# sourceMappingURL=password.js.map