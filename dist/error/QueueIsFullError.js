"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueIsFullError = void 0;
class QueueIsFullError extends Error {
    url;
    constructor(url) {
        super();
        this.url = url;
    }
}
exports.QueueIsFullError = QueueIsFullError;
