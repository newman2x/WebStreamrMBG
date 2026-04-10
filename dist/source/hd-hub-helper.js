"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRedirectUrl = void 0;
const rot13_cipher_1 = __importDefault(require("rot13-cipher"));
const resolveRedirectUrl = async (ctx, fetcher, redirectUrl) => {
    const redirectHtml = await fetcher.text(ctx, redirectUrl);
    const redirectDataMatch = redirectHtml.match(/'o','(.*?)'/);
    const redirectData = JSON.parse(atob((0, rot13_cipher_1.default)(atob(atob(redirectDataMatch[1])))));
    return new URL(atob(redirectData['o']));
};
exports.resolveRedirectUrl = resolveRedirectUrl;
