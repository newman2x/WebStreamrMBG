"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const axios_1 = __importDefault(require("axios"));
const axios_cache_interceptor_1 = require("axios-cache-interceptor");
const axios_retry_1 = __importDefault(require("axios-retry"));
const express_1 = __importDefault(require("express"));
// eslint-disable-next-line import/no-named-as-default
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const winston_1 = __importDefault(require("winston"));
const controller_1 = require("./controller");
const error_1 = require("./error");
const extractor_1 = require("./extractor");
const source_1 = require("./source");
const HomeCine_1 = require("./source/HomeCine");
const MeineCloud_1 = require("./source/MeineCloud");
const MostraGuarda_1 = require("./source/MostraGuarda");
const utils_1 = require("./utils");
if ((0, utils_1.envIsProd)()) {
    console.log = console.warn = console.error = console.info = console.debug = () => { };
}
const logger = winston_1.default.createLogger({
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.cli(), winston_1.default.format.timestamp(), winston_1.default.format.printf(({ level, message, timestamp, id }) => `${timestamp} ${level} ${id}: ${message}`)),
        }),
    ],
});
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception caught: ${error}, cause: ${error.cause}, stack: ${error.stack}`);
    process.exit(1);
});
process.on('unhandledRejection', (error) => {
    logger.error(`Unhandled rejection: ${error}, cause: ${error.cause}, stack: ${error.stack}`);
});
const cachedAxios = (0, axios_cache_interceptor_1.setupCache)(axios_1.default, {
    interpretHeader: true,
    storage: (0, axios_cache_interceptor_1.buildMemoryStorage)(false, 3 * 60 * 60 * 1000, 4096, 12 * 60 * 60 * 1000),
    ttl: 15 * 60 * 1000, // 15m
});
(0, axios_retry_1.default)(cachedAxios, { retries: 3, retryDelay: () => 333 });
const fetcher = new utils_1.Fetcher(cachedAxios, logger);
const sources = (0, source_1.createSources)(fetcher);
const extractors = (0, extractor_1.createExtractors)(fetcher);
const addon = (0, express_1.default)();
addon.set('trust proxy', true);
if ((0, utils_1.envIsProd)()) {
    addon.use((0, express_rate_limit_1.default)({ windowMs: 60 * 1000, limit: 30 }));
}
if ((0, utils_1.envGet)('CACHE_FILES_DELETE_ON_START')) {
    (async function () {
        await (0, utils_1.clearCache)(logger);
    })();
}
addon.use((req, res, next) => {
    process.env['HOST'] = req.host;
    process.env['PROTOCOL'] = req.protocol;
    res.setHeader('X-Request-ID', (0, node_crypto_1.randomUUID)());
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if ((0, utils_1.envIsProd)()) {
        res.setHeader('Cache-Control', 'public, max-age=10, immutable');
    }
    next();
});
const extractorRegistry = new extractor_1.ExtractorRegistry(logger, extractors);
addon.use('/', (new controller_1.ExtractController(logger, fetcher, extractorRegistry)).router);
addon.use('/', (new controller_1.ConfigureController(sources, extractors)).router);
addon.use('/', (new controller_1.ManifestController(sources, extractors)).router);
const streamResolver = new utils_1.StreamResolver(logger, extractorRegistry);
addon.use('/', (new controller_1.StreamController(logger, sources, streamResolver)).router);
// error handler needs to stay at the end of the stack
addon.use((err, _req, _res, next) => {
    logger.error(`Error: ${err}, cause: ${err.cause}, stack: ${err.stack}`);
    return next(err);
});
addon.get('/', (_req, res) => {
    res.redirect('/configure');
});
addon.get('/startup', async (_req, res) => {
    res.json({ status: 'ok' });
});
addon.get('/ready', async (_req, res) => {
    res.json({ status: 'ok' });
});
let lastLiveProbeRequestsTimestamp = 0;
addon.get('/live', async (req, res) => {
    const ctx = (0, utils_1.contextFromRequestAndResponse)(req, res);
    const sources = [
        new HomeCine_1.HomeCine(fetcher),
        new MeineCloud_1.MeineCloud(fetcher),
        new MostraGuarda_1.MostraGuarda(fetcher),
    ];
    const hrefs = [
        ...sources.map(source => source.baseUrl),
        'https://cloudnestra.com',
    ];
    const results = new Map();
    let blockedCount = 0;
    let errorCount = 0;
    const fetchFactories = hrefs.map(href => async () => {
        const url = new URL(href);
        try {
            await fetcher.head(ctx, url);
            results.set(url.host, 'ok');
        }
        catch (error) {
            if (error instanceof error_1.BlockedError) {
                results.set(url.host, 'blocked');
                blockedCount++;
            }
            else {
                results.set(url.host, 'error');
                errorCount++;
            }
            (0, error_1.logErrorAndReturnNiceString)(ctx, logger, href, error);
        }
    });
    if (Date.now() - lastLiveProbeRequestsTimestamp > 60000 || 'force' in req.query) { // every minute
        await Promise.all(fetchFactories.map(fn => fn()));
        lastLiveProbeRequestsTimestamp = Date.now();
    }
    const details = Object.fromEntries(results);
    if (blockedCount > 0) {
        // TODO: fail health check and try to get a clean IP if infra is ready
        logger.warn('IP might be not clean and leading to blocking.', ctx);
        res.json({ status: 'ok', details });
    }
    else if (errorCount === sources.length) {
        res.status(503).json({ status: 'error', details });
    }
    else {
        res.json({ status: 'ok', ipStatus: 'ok', details });
    }
});
addon.get('/stats', async (_req, res) => {
    res.json({
        extractorRegistry: extractorRegistry.stats(),
        fetcher: fetcher.stats(),
        sources: source_1.Source.stats(),
    });
});
const port = parseInt((0, utils_1.envGet)('PORT') || '51546');
addon.listen(port, () => {
    logger.info(`Add-on Repository URL: http://127.0.0.1:${port}/manifest.json`);
});
