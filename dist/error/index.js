"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logErrorAndReturnNiceString = void 0;
const types_1 = require("../types");
const BlockedError_1 = require("./BlockedError");
const HttpError_1 = require("./HttpError");
const QueueIsFullError_1 = require("./QueueIsFullError");
const TimeoutError_1 = require("./TimeoutError");
const TooManyRequestsError_1 = require("./TooManyRequestsError");
const TooManyTimeoutsError_1 = require("./TooManyTimeoutsError");
__exportStar(require("./BlockedError"), exports);
__exportStar(require("./HttpError"), exports);
__exportStar(require("./NotFoundError"), exports);
__exportStar(require("./QueueIsFullError"), exports);
__exportStar(require("./TimeoutError"), exports);
__exportStar(require("./TooManyRequestsError"), exports);
__exportStar(require("./TooManyTimeoutsError"), exports);
const logErrorAndReturnNiceString = (ctx, logger, source, error) => {
    if (error instanceof BlockedError_1.BlockedError) {
        if (error.reason === types_1.BlockedReason.media_flow_proxy_auth) {
            return '⚠️ MediaFlow Proxy authentication failed. Please set the correct password.';
        }
        logger.warn(`${source}: Request to ${error.url} was blocked, reason: ${error.reason}, headers: ${JSON.stringify(error.headers)}.`, ctx);
        return `⚠️ Request to ${error.url.host} was blocked. Reason: ${error.reason}`;
    }
    if (error instanceof TooManyRequestsError_1.TooManyRequestsError) {
        logger.warn(`${source}: Request to ${error.url} was rate limited for ${error.retryAfter} seconds.`, ctx);
        return `🚦 Request to ${error.url.host} was rate-limited. Please try again later or consider self-hosting.`;
    }
    if (error instanceof TooManyTimeoutsError_1.TooManyTimeoutsError) {
        logger.warn(`${source}: Too many timeouts when requesting ${error.url}.`, ctx);
        return `🚦 Too many recent timeouts when requesting ${error.url.host}. Please try again later.`;
    }
    if (error instanceof TimeoutError_1.TimeoutError) {
        logger.warn(`${source}: Request to ${error.url} timed out.`, ctx);
        return `🐢 Request to ${error.url.host} timed out.`;
    }
    if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
        // sometimes this gets through, no idea why..
        logger.warn(`${source}: Request timed out.`, ctx);
        return '🐢 Request timed out.';
    }
    if (error instanceof QueueIsFullError_1.QueueIsFullError) {
        logger.warn(`${source}: Request queue for ${error.url.host} is full.`, ctx);
        return `⏳ Request queue for ${error.url.host} is full. Please try again later or consider self-hosting.`;
    }
    if (error instanceof HttpError_1.HttpError) {
        logger.error(`${source}: Error when requesting url ${error.url}, HTTP status ${error.status} (${error.statusText}), headers: ${JSON.stringify(error.headers)}, stack: ${error.stack}.`, ctx);
        if (error.status >= 500) {
            return `❌ Remote server ${error.url.host} has issues. We can't fix this, please try later again.`;
        }
        return `❌ Request to ${error.url.host} failed with status ${error.status} (${error.statusText}). Request-id: ${ctx.id}.`;
    }
    const cause = error.cause;
    logger.error(`${source} error: ${error}, cause: ${cause}, stack: ${error.stack}`, ctx);
    return `❌ Request failed. Request-id: ${ctx.id}.`;
};
exports.logErrorAndReturnNiceString = logErrorAndReturnNiceString;
