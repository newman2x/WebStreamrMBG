"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMediaFlowProxyHlsUrl = exports.buildMediaFlowProxyExtractorStreamUrl = exports.buildMediaFlowProxyExtractorRedirectUrl = exports.supportsMediaFlowProxy = void 0;
const supportsMediaFlowProxy = (ctx) => !!ctx.config['mediaFlowProxyUrl'];
exports.supportsMediaFlowProxy = supportsMediaFlowProxy;
const buildMediaFlowProxyExtractorUrl = (ctx, host, url, headers) => {
    const mediaFlowProxyUrl = new URL('/extractor/video', `https://${ctx.config.mediaFlowProxyUrl?.replace(/^https?.\/\//, '')}`);
    mediaFlowProxyUrl.searchParams.append('host', host);
    mediaFlowProxyUrl.searchParams.append('api_password', `${ctx.config.mediaFlowProxyPassword}`);
    mediaFlowProxyUrl.searchParams.append('d', url.href);
    for (const headerKey in headers) {
        mediaFlowProxyUrl.searchParams.set('h_' + headerKey.toLowerCase(), headers[headerKey]);
    }
    return mediaFlowProxyUrl;
};
const buildMediaFlowProxyExtractorRedirectUrl = (ctx, host, url, headers = {}) => {
    const mediaFlowProxyUrl = buildMediaFlowProxyExtractorUrl(ctx, host, url, headers);
    mediaFlowProxyUrl.searchParams.append('redirect_stream', 'true');
    return mediaFlowProxyUrl;
};
exports.buildMediaFlowProxyExtractorRedirectUrl = buildMediaFlowProxyExtractorRedirectUrl;
const buildMediaFlowProxyExtractorStreamUrl = async (ctx, fetcher, host, url, headers) => {
    const mediaFlowProxyUrl = buildMediaFlowProxyExtractorUrl(ctx, host, url, headers);
    const extractResult = await fetcher.json(ctx, mediaFlowProxyUrl, { queueLimit: 4, queueTimeout: 10000, timeout: 20000 });
    const streamUrl = new URL(extractResult.mediaflow_proxy_url);
    for (const queryParamsKey in extractResult.query_params) {
        streamUrl.searchParams.append(queryParamsKey, extractResult.query_params[queryParamsKey]);
    }
    for (const requestHeadersKey in extractResult.request_headers) {
        streamUrl.searchParams.append(`h_${requestHeadersKey}`, extractResult.request_headers[requestHeadersKey]);
    }
    streamUrl.searchParams.append('d', extractResult.destination_url);
    return streamUrl;
};
exports.buildMediaFlowProxyExtractorStreamUrl = buildMediaFlowProxyExtractorStreamUrl;
const buildMediaFlowProxyHlsUrl = (ctx, m3u8Url, headers = {}, proxySegments = false) => {
    const mediaFlowProxyUrl = new URL('/proxy/hls/manifest.m3u8', `https://${ctx.config.mediaFlowProxyUrl?.replace(/^https?:\/\//, '')}`);
    mediaFlowProxyUrl.searchParams.append('api_password', `${ctx.config.mediaFlowProxyPassword}`);
    mediaFlowProxyUrl.searchParams.append('d', m3u8Url.href);
    if (proxySegments)
        mediaFlowProxyUrl.searchParams.append('force_playlist_proxy', 'true');
    for (const headerKey in headers) {
        mediaFlowProxyUrl.searchParams.set('h_' + headerKey.toLowerCase(), headers[headerKey]);
    }
    return mediaFlowProxyUrl;
};
exports.buildMediaFlowProxyHlsUrl = buildMediaFlowProxyHlsUrl;
