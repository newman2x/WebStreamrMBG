"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TooManyTimeoutsError = void 0;
class TooManyTimeoutsError extends Error {
    url;
    constructor(url) {
        super();
        this.url = url;
    }
}
exports.TooManyTimeoutsError = TooManyTimeoutsError;
