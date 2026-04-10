"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockedError = void 0;
class BlockedError extends Error {
    url;
    reason;
    headers;
    constructor(url, reason, headers) {
        super();
        this.url = url;
        this.reason = reason;
        this.headers = headers;
    }
}
exports.BlockedError = BlockedError;
