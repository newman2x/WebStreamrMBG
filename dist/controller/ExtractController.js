"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtractController = void 0;
const async_mutex_1 = require("async-mutex");
const express_1 = require("express");
const utils_1 = require("../utils");
class ExtractController {
    router;
    logger;
    extractorRegistry;
    locks = new Map();
    constructor(logger, _fetcher, extractorRegistry) {
        this.router = (0, express_1.Router)();
        this.logger = logger;
        this.extractorRegistry = extractorRegistry;
        this.router.get('/extract', this.extract.bind(this));
    }
    async extract(req, res) {
        if (req.method !== 'GET') {
            res.status(405).send('Method Not Allowed');
            return;
        }
        const ctx = (0, utils_1.contextFromRequestAndResponse)(req, res);
        const index = parseInt(req.query['index']);
        const url = new URL(req.query['url']);
        this.logger.info(`Lazy extract index ${index} of URL ${url} for ip ${ctx.ip}`, ctx);
        let mutex = this.locks.get(url.href);
        if (!mutex) {
            mutex = new async_mutex_1.Mutex();
            this.locks.set(url.href, mutex);
        }
        await mutex.runExclusive(async () => {
            const urlResults = await this.extractorRegistry.handle(ctx, url);
            res.redirect(urlResults[index]?.url.href);
        });
        if (!mutex.isLocked()) {
            this.locks.delete(url.href);
        }
    }
    ;
}
exports.ExtractController = ExtractController;
