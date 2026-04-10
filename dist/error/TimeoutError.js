"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeoutError = void 0;
class TimeoutError extends Error {
    url;
    constructor(url) {
        super();
        this.url = url;
    }
}
exports.TimeoutError = TimeoutError;
