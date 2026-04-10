"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fetcher = void 0;
/* istanbul ignore file */
const node_https_1 = require("node:https");
const async_mutex_1 = require("async-mutex");
const axios_1 = require("axios");
const cacheable_1 = require("cacheable");
const http_proxy_agent_1 = require("http-proxy-agent");
const https_proxy_agent_1 = require("https-proxy-agent");
const minimatch_1 = require("minimatch");
const socks_proxy_agent_1 = require("socks-proxy-agent");
const tough_cookie_1 = require("tough-cookie");
const error_1 = require("../error");
const types_1 = require("../types");
const env_1 = require("./env");
class Fetcher {
    DEFAULT_TIMEOUT = 10000;
    DEFAULT_QUEUE_LIMIT = 50;
    DEFAULT_QUEUE_TIMEOUT = 10000;
    DEFAULT_TIMEOUTS_COUNT_THROW = 30;
    TIMEOUT_CACHE_TTL = 60 * 60 * 1000; // 1h
    FLARESOLVERR_CACHE_TTL = 15 * 60 * 1000; // 15m
    MAX_WAIT_RETRY_AFTER = 10000;
    axios;
    logger;
    proxyConfig = new Map();
    rateLimitedCache = new cacheable_1.Cacheable({ primary: new cacheable_1.Keyv({ store: new cacheable_1.CacheableMemory({ lruSize: 1024 }) }) });
    semaphores = new Map();
    hostUserAgentMap = new Map();
    cookieJar = new tough_cookie_1.CookieJar();
    timeoutsCountCache = new cacheable_1.Cacheable({ primary: new cacheable_1.Keyv({ store: new cacheable_1.CacheableMemory({ lruSize: 1024 }) }) });
    timeoutsCountMutex = new async_mutex_1.Mutex();
    httpStatus = new Map();
    httpStatusMutex = new async_mutex_1.Mutex();
    flareSolverrCache = new cacheable_1.Cacheable({ primary: new cacheable_1.Keyv({ store: new cacheable_1.CacheableMemory({ lruSize: 1024 }) }) });
    flareSolverrMutexes = new Map();
    constructor(axios, logger) {
        this.axios = axios;
        this.logger = logger;
    }
    stats() {
        return {
            httpStatus: Object.fromEntries(this.httpStatus),
            hostUserAgentMap: Object.fromEntries(this.hostUserAgentMap),
            cookieJar: this.cookieJar.toJSON(),
        };
    }
    ;
    async fetch(ctx, url, requestConfig) {
        return await this.queuedFetch(ctx, url, requestConfig);
    }
    ;
    async text(ctx, url, requestConfig) {
        return (await this.queuedFetch(ctx, url, requestConfig)).data;
    }
    ;
    async textPost(ctx, url, data, requestConfig) {
        return (await this.queuedFetch(ctx, url, { ...requestConfig, method: 'POST', data })).data;
    }
    ;
    async head(ctx, url, requestConfig) {
        return (await this.queuedFetch(ctx, url, { ...requestConfig, method: 'HEAD' })).headers;
    }
    ;
    async getFinalRedirectUrl(ctx, url, requestConfig, maxCount, count) {
        const newRequestConfig = { ...requestConfig, method: 'HEAD', maxRedirects: 0 };
        if (count && maxCount && count >= maxCount) {
            return url;
        }
        const response = await this.queuedFetch(ctx, url, newRequestConfig);
        if (response.status >= 300 && response.status < 400) {
            return await this.getFinalRedirectUrl(ctx, new URL(response.headers['location']), newRequestConfig, maxCount, (count ?? 0) + 1);
        }
        return url;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async json(ctx, url, requestConfig) {
        const jsonRequestConfig = {
            headers: {
                Accept: 'application/json,text/plain,*/*',
            },
            ...requestConfig,
        };
        return JSON.parse(await this.text(ctx, url, jsonRequestConfig));
    }
    async fetchWithTimeout(ctx, url, requestConfig, tryCount = 0) {
        const proxyUrl = this.getProxyForUrl(ctx, url);
        let message = `Fetch ${requestConfig?.method ?? 'GET'} ${url}`;
        /* istanbul ignore if */
        if (requestConfig?.headers && requestConfig?.headers['Referer']) {
            message += ' with referer ' + requestConfig?.headers['Referer'];
        }
        /* istanbul ignore if */
        if (proxyUrl) {
            message += ' via proxy ' + proxyUrl;
        }
        this.logger.info(message, ctx);
        const isRateLimitedRaw = await this.rateLimitedCache.getRaw(url.host);
        /* istanbul ignore if */
        if (isRateLimitedRaw && isRateLimitedRaw.value && isRateLimitedRaw.expires) {
            const ttl = isRateLimitedRaw.expires - Date.now();
            if (ttl <= this.MAX_WAIT_RETRY_AFTER && tryCount < 1) {
                this.logger.info(`Wait out rate limit for ${url}`, ctx);
                await this.sleep(ttl);
                return await this.fetchWithTimeout(ctx, url, { ...requestConfig, queueLimit: 1 }, ++tryCount);
            }
            throw new error_1.TooManyRequestsError(url, (isRateLimitedRaw.expires - Date.now()) / 1000);
        }
        const timeouts = (await this.timeoutsCountCache.get(url.host)) ?? 0;
        if (!this.isFlareSolverrUrl(url) && timeouts >= (requestConfig?.timeoutsCountThrow ?? this.DEFAULT_TIMEOUTS_COUNT_THROW)) {
            throw new error_1.TooManyTimeoutsError(url);
        }
        let response;
        try {
            const finalUrl = new URL(url.href);
            finalUrl.username = '';
            finalUrl.password = '';
            const cookieString = this.cookieJar.getCookieStringSync(url.href);
            const forwardedProto = url.protocol.slice(0, -1);
            response = await this.axios.request({
                ...requestConfig,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en',
                    ...(url.username && { Authorization: 'Basic ' + Buffer.from(`${url.username}:${url.password}`).toString('base64') }),
                    'Priority': 'u=0',
                    'User-Agent': this.hostUserAgentMap.get(url.host) ?? 'Mozilla',
                    ...(cookieString && { Cookie: cookieString }),
                    ...(ctx.ip && !requestConfig?.noProxyHeaders && {
                        'Forwarded': `by=unknown;for=${ctx.ip};host=${url.host};proto=${forwardedProto}`,
                        'X-Forwarded-For': ctx.ip,
                        'X-Forwarded-Host': url.host,
                        'X-Forwarded-Proto': forwardedProto,
                        'X-Real-IP': ctx.ip,
                    }),
                    ...requestConfig?.headers,
                },
                ...(proxyUrl && this.getProxyConfig(proxyUrl)),
                ...(!proxyUrl && { httpsAgent: new node_https_1.Agent({ rejectUnauthorized: false }) }),
                url: finalUrl.href,
                timeout: requestConfig?.timeout ?? this.DEFAULT_TIMEOUT,
                transformResponse: [data => data],
                validateStatus: () => true,
            });
        }
        catch (error) {
            await this.trackHttpStatus(ctx, url, 0);
            this.logger.info(`Got error ${error} for ${url}`, ctx);
            if (error instanceof axios_1.AxiosError && error.code === 'ECONNABORTED') {
                await this.increaseTimeoutsCount(url);
                throw new error_1.TimeoutError(url);
            }
            throw error;
        }
        await this.trackHttpStatus(ctx, url, response.status);
        this.logger.info(`Got ${response.status} (${response.statusText}) for ${url}`, ctx);
        await this.decreaseTimeoutsCount(url);
        if (response.status === 429) {
            const retryAfter = parseInt(`${response.headers['retry-after']}`) * 1000;
            if (retryAfter <= this.MAX_WAIT_RETRY_AFTER && tryCount < 1) {
                this.logger.info(`Wait out rate limit for ${url.host}`, ctx);
                await this.sleep(retryAfter);
                return await this.fetchWithTimeout(ctx, url, { ...requestConfig, queueLimit: 1 }, ++tryCount);
            }
        }
        const triggeredCloudflareTurnstile = 'cf-turnstile' in response.headers;
        if (response.status && response.status >= 200 && response.status <= 399 && !triggeredCloudflareTurnstile) {
            return response;
        }
        if (response.status === 404) {
            throw new error_1.NotFoundError();
        }
        if (response.headers['cf-mitigated'] === 'challenge' || triggeredCloudflareTurnstile) {
            const flareSolverrEndpoint = (0, env_1.envGet)('FLARESOLVERR_ENDPOINT');
            if (!flareSolverrEndpoint) {
                throw new error_1.BlockedError(url, types_1.BlockedReason.cloudflare_challenge, response.headers);
            }
            const cachedSolution = await this.flareSolverrCache.get(url.href);
            if (cachedSolution) {
                response.status = cachedSolution.status;
                response.data = cachedSolution.response;
                return response;
            }
            const session = `${(0, env_1.envGetAppId)()}_${url.host}`;
            let mutex = this.flareSolverrMutexes.get(session);
            if (!mutex) {
                mutex = new async_mutex_1.Mutex();
                this.flareSolverrMutexes.set(session, mutex);
            }
            const challengeResult = await mutex.runExclusive(async () => {
                this.logger.info(`Query FlareSolverr for ${url.href}`, ctx);
                const data = {
                    cmd: 'request.get',
                    url: url.href,
                    session,
                    session_ttl_minutes: 60,
                    maxTimeout: 15000,
                    disableMedia: true,
                    ...(proxyUrl && { proxy: { url: proxyUrl.href } }),
                };
                const requestConfig = { method: 'POST', data, headers: { 'Content-Type': 'application/json' }, timeout: 15000, queueTimeout: 60000 };
                return JSON.parse((await this.queuedFetch(ctx, new URL('/v1', flareSolverrEndpoint), requestConfig)).data);
            });
            if (challengeResult.status !== 'ok') {
                this.logger.warn(`FlareSolverr issue: ${JSON.stringify(challengeResult)}`, ctx);
                throw new error_1.BlockedError(url, types_1.BlockedReason.flaresolverr_failed, {});
            }
            challengeResult.solution.cookies.forEach((cookie) => {
                if (!cookie.name.startsWith('cf_') && !cookie.name.startsWith('__cf') && !cookie.name.startsWith('__ddg')) {
                    return;
                }
                this.cookieJar.setCookie(new tough_cookie_1.Cookie({
                    domain: cookie.domain.replace(/^.+/, ''),
                    expires: new Date(cookie.expiry * 1000),
                    httpOnly: cookie.httpOnly,
                    key: cookie.name,
                    path: cookie.path,
                    sameSite: cookie.sameSite,
                    secure: cookie.secure,
                    value: cookie.value,
                }), url.href);
            });
            this.hostUserAgentMap.set(url.host, challengeResult.solution.userAgent);
            response.status = challengeResult.solution.status;
            response.data = challengeResult.solution.response;
            await this.flareSolverrCache.set(url.href, challengeResult.solution, this.FLARESOLVERR_CACHE_TTL);
            return response;
        }
        if (response.status === 403) {
            if (ctx.config.mediaFlowProxyUrl && url.href.includes(ctx.config.mediaFlowProxyUrl)) {
                throw new error_1.BlockedError(url, types_1.BlockedReason.media_flow_proxy_auth, response.headers);
            }
            throw new error_1.BlockedError(url, types_1.BlockedReason.unknown, response.headers);
        }
        if (response.status === 451) {
            throw new error_1.BlockedError(url, types_1.BlockedReason.cloudflare_censor, response.headers);
        }
        if (response.status === 429) {
            const retryAfter = parseInt(`${response.headers['retry-after']}`);
            if (!isNaN(retryAfter)) {
                await this.rateLimitedCache.set(url.host, true, retryAfter * 1000);
            }
            throw new error_1.TooManyRequestsError(url, retryAfter);
        }
        throw new error_1.HttpError(url, response.status, response.statusText, response.headers);
    }
    ;
    async increaseTimeoutsCount(url) {
        await this.timeoutsCountMutex.runExclusive(async () => {
            const count = (await this.timeoutsCountCache.get(url.host)) ?? 0;
            const newCount = count + 1;
            await this.timeoutsCountCache.set(url.host, newCount, this.TIMEOUT_CACHE_TTL);
        });
    }
    async decreaseTimeoutsCount(url) {
        await this.timeoutsCountMutex.runExclusive(async () => {
            const count = (await this.timeoutsCountCache.get(url.host)) ?? 0;
            const newCount = Math.max(0, count - 1);
            await this.timeoutsCountCache.set(url.host, newCount, this.TIMEOUT_CACHE_TTL);
        });
    }
    getSemaphore(url, queueLimit, queueTimeout) {
        let sem = this.semaphores.get(url.host);
        if (!sem) {
            sem = (0, async_mutex_1.withTimeout)(new async_mutex_1.Semaphore(queueLimit), queueTimeout, new error_1.QueueIsFullError(url));
            this.semaphores.set(url.host, sem);
        }
        return sem;
    }
    async queuedFetch(ctx, url, requestConfig) {
        const queueLimit = requestConfig?.queueLimit ?? this.DEFAULT_QUEUE_LIMIT;
        const queueTimeout = requestConfig?.queueTimeout ?? this.DEFAULT_QUEUE_TIMEOUT;
        const semaphore = this.getSemaphore(url, queueLimit, queueTimeout);
        const [, release] = await semaphore.acquire();
        try {
            return await this.fetchWithTimeout(ctx, url, requestConfig);
        }
        finally {
            release();
        }
    }
    sleep(ms) {
        return new Promise(sleep => setTimeout(sleep, ms));
    }
    isFlareSolverrUrl(url) {
        const flareSolverrEndpoint = (0, env_1.envGet)('FLARESOLVERR_ENDPOINT');
        return !!flareSolverrEndpoint && url.href.startsWith(flareSolverrEndpoint);
    }
    getProxyForUrl(ctx, url) {
        if (ctx.config.mediaFlowProxyUrl && url.href.includes(ctx.config.mediaFlowProxyUrl)) {
            return undefined;
        }
        if (this.isFlareSolverrUrl(url)) {
            return undefined;
        }
        const proxyConfig = process.env['PROXY_CONFIG'];
        if (proxyConfig) {
            for (const rule of proxyConfig.split(',')) {
                const [hostPattern, proxy] = rule.split(/:(.+)/);
                if (!hostPattern || !proxy) {
                    throw new Error(`Proxy rule "${rule}" is invalid.`);
                }
                if (hostPattern === '*' || (0, minimatch_1.minimatch)(url.host, hostPattern)) {
                    return proxy === 'false' ? undefined : new URL(proxy);
                }
            }
        }
        else if (process.env['ALL_PROXY']) {
            return new URL(process.env['ALL_PROXY']);
        }
        return undefined;
    }
    getProxyConfig(proxyUrl) {
        let proxyConfig = this.proxyConfig.get(proxyUrl.href);
        if (!proxyConfig) {
            const httpsAgent = proxyUrl.protocol === 'socks5:' ? new socks_proxy_agent_1.SocksProxyAgent(proxyUrl) : new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
            httpsAgent.options.rejectUnauthorized = false;
            proxyConfig = {
                httpAgent: proxyUrl.protocol === 'socks5:' ? new socks_proxy_agent_1.SocksProxyAgent(proxyUrl) : new http_proxy_agent_1.HttpProxyAgent(proxyUrl),
                httpsAgent,
                proxy: false,
            };
            this.proxyConfig.set(proxyUrl.href, proxyConfig);
        }
        return proxyConfig;
    }
    async trackHttpStatus(ctx, url, status) {
        if (ctx.config.mediaFlowProxyUrl && url.href.includes(ctx.config.mediaFlowProxyUrl)) {
            return;
        }
        await this.httpStatusMutex.runExclusive(() => {
            const httpStatusCounts = this.httpStatus.get(url.host) ?? {};
            httpStatusCounts[status] = (httpStatusCounts[status] ?? 0) + 1;
            this.httpStatus.set(url.host, httpStatusCounts);
        });
    }
}
exports.Fetcher = Fetcher;
