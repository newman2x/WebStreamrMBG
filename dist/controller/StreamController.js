"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamController = void 0;
const async_mutex_1 = require("async-mutex");
const express_1 = require("express");
const utils_1 = require("../utils");
class StreamController {
    router;
    logger;
    sources;
    streamResolver;
    locks = new Map();
    constructor(logger, sources, streams) {
        this.router = (0, express_1.Router)();
        this.logger = logger;
        this.sources = sources;
        this.streamResolver = streams;
        this.router.get('/stream/:type/:id.json', this.getStream.bind(this));
        this.router.get('/:config/stream/:type/:id.json', this.getStream.bind(this));
    }
    async getStream(req, res) {
        const type = (req.params['type'] || '');
        const rawId = req.params['id'] || '';
        let id;
        if (rawId.startsWith('tmdb:')) {
            id = utils_1.TmdbId.fromString(rawId.replace('tmdb:', ''));
        }
        else if (rawId.startsWith('tt')) {
            id = utils_1.ImdbId.fromString(rawId);
        }
        else {
            res.status(400).send(`Unsupported ID: ${rawId}`);
            return;
        }
        const ctx = (0, utils_1.contextFromRequestAndResponse)(req, res);
        this.logger.info(`Search stream for type "${type}" and id "${rawId}" for ip ${ctx.ip}`, ctx);
        const sources = this.sources.filter(source => source.countryCodes.filter(countryCode => countryCode in ctx.config).length);
        let mutex = this.locks.get(rawId);
        if (!mutex) {
            mutex = new async_mutex_1.Mutex();
            this.locks.set(rawId, mutex);
        }
        await mutex.runExclusive(async () => {
            const { streams, ttl } = await this.streamResolver.resolve(ctx, sources, type, id);
            if (ttl && (0, utils_1.envIsProd)()) {
                res.setHeader('Cache-Control', `public, max-age=${Math.floor(ttl / 1000)}, immutable`);
            }
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ streams }));
        });
        if (!mutex.isLocked()) {
            this.locks.delete(rawId);
        }
    }
    ;
}
exports.StreamController = StreamController;
