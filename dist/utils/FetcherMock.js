"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FetcherMock = void 0;
/* istanbul ignore file */
const crypto_1 = __importDefault(require("crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const axios_1 = __importDefault(require("axios"));
const slugify_1 = __importDefault(require("slugify"));
const winston_1 = __importDefault(require("winston"));
const error_1 = require("../error");
const env_1 = require("./env");
const Fetcher_1 = require("./Fetcher");
class FetcherMock extends Fetcher_1.Fetcher {
    fixturePath;
    constructor(fixturePath) {
        super(axios_1.default, winston_1.default.createLogger({ transports: [new winston_1.default.transports.Console({ level: 'nope' })] }));
        this.fixturePath = fixturePath;
    }
    async fetch(ctx, url, requestConfig) {
        let path;
        if (requestConfig?.method === 'POST') {
            const data = requestConfig.data;
            path = `${this.fixturePath}/post-${this.slugifyUrl(url)}-${(0, slugify_1.default)(data)}`;
        }
        else if (requestConfig?.method === 'HEAD') {
            path = `${this.fixturePath}/head-${this.slugifyUrl(url)}`;
        }
        else {
            path = `${this.fixturePath}/${this.slugifyUrl(url)}`;
        }
        return this.fetchInternal(path, ctx, url, requestConfig);
    }
    ;
    async text(ctx, url, requestConfig) {
        const path = `${this.fixturePath}/${this.slugifyUrl(url)}`;
        return (await this.fetchInternal(path, ctx, url, requestConfig)).data;
    }
    ;
    async textPost(ctx, url, data, requestConfig) {
        const path = `${this.fixturePath}/post-${this.slugifyUrl(url)}-${(0, slugify_1.default)(data)}`;
        return (await this.fetchInternal(path, ctx, url, { ...requestConfig, method: 'POST', data })).data;
    }
    ;
    async head(ctx, url, init) {
        const path = `${this.fixturePath}/head-${this.slugifyUrl(url)}`;
        return (await this.fetchInternal(path, ctx, url, { ...init, method: 'HEAD' })).headers;
    }
    ;
    async getFinalRedirectUrl(ctx, url, requestConfig, maxCount, count) {
        const newRequestConfig = { ...requestConfig, method: 'HEAD', maxRedirects: 0 };
        if (count && maxCount && count >= maxCount) {
            return url;
        }
        const response = await this.fetch(ctx, url, newRequestConfig);
        if (response.headers['location']) {
            return await this.getFinalRedirectUrl(ctx, new URL(response.headers['location']), newRequestConfig, maxCount, (count ?? 0) + 1);
        }
        return url;
    }
    slugifyUrl = (url) => {
        const slugifiedUrl = (0, slugify_1.default)(url.href);
        if (slugifiedUrl.length > 249) {
            return (0, slugify_1.default)(`${url.origin}-${crypto_1.default.createHash('md5').update(url.href).digest('hex')}`);
        }
        return slugifiedUrl;
    };
    fetchInternal = async (path, ctx, url, requestConfig) => {
        const errorPath = `${path}.error`;
        const isHead = requestConfig?.method === 'HEAD';
        if (node_fs_1.default.existsSync(errorPath)) {
            const message = node_fs_1.default.readFileSync(errorPath).toString();
            if (message.includes('404: Not Found')) {
                throw new error_1.NotFoundError(message);
            }
            throw new Error(message);
        }
        else if (node_fs_1.default.existsSync(path)) {
            const data = node_fs_1.default.readFileSync(path).toString();
            return {
                data: isHead ? '' : data,
                headers: isHead ? JSON.parse(data) : {},
                status: 200,
                statusText: 'OK',
                config: {},
            };
        }
        else {
            let response;
            try {
                if ((0, env_1.envGet)('TEST_UPDATE_FIXTURES')) {
                    response = await super.fetchWithTimeout(ctx, url, requestConfig);
                }
                else {
                    console.error(`No fixture found at "${path}".`);
                    process.exit(1);
                }
            }
            catch (error) {
                node_fs_1.default.writeFileSync(errorPath, `${error}`);
                throw error;
            }
            if (response.status < 200 || response.status > 399) {
                const message = `Fetcher error: ${response.status}: ${response.statusText}`;
                node_fs_1.default.writeFileSync(errorPath, message);
                throw new Error(message);
            }
            let result;
            if (isHead) {
                result = JSON.stringify(response.headers);
            }
            else {
                result = response.data;
            }
            node_fs_1.default.writeFileSync(path, result);
            return {
                data: isHead ? '' : result,
                headers: isHead ? JSON.parse(result) : {},
                status: 200,
                statusText: 'OK',
                config: {},
            };
        }
    };
}
exports.FetcherMock = FetcherMock;
