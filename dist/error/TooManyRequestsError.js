"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TooManyRequestsError = void 0;
class TooManyRequestsError extends Error {
    url;
    retryAfter;
    constructor(url, retryAfter) {
        super();
        this.url = url;
        this.retryAfter = retryAfter;
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
