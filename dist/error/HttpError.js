"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
class HttpError extends Error {
    url;
    status;
    statusText;
    headers;
    constructor(url, status, statusText, headers) {
        super();
        this.url = url;
        this.status = status;
        this.statusText = statusText;
        this.headers = headers;
    }
}
exports.HttpError = HttpError;
