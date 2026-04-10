"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamResolver = void 0;
const async_mutex_1 = require("async-mutex");
const bytes_1 = __importDefault(require("bytes"));
const error_1 = require("../error");
const types_1 = require("../types");
const config_1 = require("./config");
const env_1 = require("./env");
const language_1 = require("./language");
const resolution_1 = require("./resolution");
class StreamResolver {
    logger;
    extractorRegistry;
    constructor(logger, extractorRegistry) {
        this.logger = logger;
        this.extractorRegistry = extractorRegistry;
    }
    async resolve(ctx, sources, type, id) {
        if (sources.length === 0) {
            return {
                streams: [
                    {
                        name: 'WebStreamrMBG',
                        title: '⚠️ No sources found. Please re-configure the plugin.',
                        externalUrl: ctx.hostUrl.href,
                    },
                ],
            };
        }
        const streams = [];
        let sourceErrorCount = 0;
        const sourceErrorCountMutex = new async_mutex_1.Mutex();
        const urlResults = [];
        const urlResultsCountByCountryCode = new Map();
        const urlResultsCountByCountryCodeMutex = new async_mutex_1.Mutex();
        const skippedFallbackSources = [];
        const handleSource = async (source, countUrlResultsByCountryCode) => {
            try {
                const sourceResults = await source.handle(ctx, type, id);
                const sourceUrlResults = await Promise.all(sourceResults.map(({ url, meta }) => this.extractorRegistry.handle(ctx, url, { sourceLabel: source.label, sourceId: source.id, priority: source.priority, ...meta }, true)));
                for (const urlResult of sourceUrlResults.flat()) {
                    urlResults.push(urlResult);
                    if (urlResult.error || !countUrlResultsByCountryCode) {
                        continue;
                    }
                    await urlResultsCountByCountryCodeMutex.runExclusive(() => {
                        urlResult.meta?.countryCodes?.forEach((countryCode) => {
                            urlResultsCountByCountryCode.set(countryCode, (urlResultsCountByCountryCode.get(countryCode) ?? 0) + 1);
                        });
                    });
                }
            }
            catch (error) {
                await sourceErrorCountMutex.runExclusive(() => {
                    sourceErrorCount++;
                });
                if ((0, config_1.showErrors)(ctx.config)) {
                    streams.push({
                        name: (0, env_1.envGetAppName)(),
                        title: [`🔗 ${source.label}`, (0, error_1.logErrorAndReturnNiceString)(ctx, this.logger, source.id, error)].join('\n'),
                        externalUrl: source.baseUrl,
                    });
                }
            }
        };
        // Resolve non-fallback sources in parallel extracting all their results
        const sourcePromises = sources.map(async (source) => {
            if (!source.contentTypes.includes(type)) {
                return;
            }
            if (source.useOnlyWithMaxUrlsFound !== undefined) {
                skippedFallbackSources.push(source);
                return;
            }
            await handleSource(source, true);
        });
        await Promise.all(sourcePromises);
        // Resolve fallback sources if we didn't get enough results already
        const skippedFallbackSourcePromises = skippedFallbackSources.map(async (skippedFallbackSource) => {
            const resultCount = urlResults.reduce((accumulator, urlResult) => accumulator + Number(this.arraysIntersect(skippedFallbackSource.countryCodes, /* istanbul ignore next */ urlResult.meta?.countryCodes ?? [])), 0);
            if (resultCount > skippedFallbackSource.useOnlyWithMaxUrlsFound) {
                return;
            }
            await handleSource(skippedFallbackSource, false);
        });
        await Promise.all(skippedFallbackSourcePromises);
        urlResults.sort((a, b) => {
            if (a.error || b.error) {
                return a.error ? -1 : 1;
            }
            if (a.isExternal || b.isExternal) {
                return a.isExternal ? 1 : -1;
            }
            const heightComparison = (b.meta?.height ?? 0) - (a.meta?.height ?? 0);
            if (heightComparison !== 0) {
                return heightComparison;
            }
            const bytesComparison = (b.meta?.bytes ?? 0) - (a.meta?.bytes ?? 0);
            if (bytesComparison !== 0) {
                return bytesComparison;
            }
            const priorityComparison = (b.meta?.priority ?? 0) - (a.meta?.priority ?? 0);
            if (priorityComparison !== 0) {
                return priorityComparison;
            }
            return a.label.localeCompare(b.label);
        });
        const errorCount = urlResults.reduce((count, urlResult) => urlResult.error ? count + 1 : count, sourceErrorCount);
        this.logger.info(`Got ${urlResults.length} url results, including ${errorCount} errors`, ctx);
        streams.push(...urlResults.filter(urlResult => (!urlResult.error || (0, config_1.showErrors)(ctx.config)) && !(0, config_1.isResolutionExcluded)(ctx.config, (0, resolution_1.getClosestResolution)(urlResult.meta?.height)))
            .filter((urlResult, index, self) => 
        // Remove duplicate URLs
        index === self.findIndex(t => t.url.href === urlResult.url.href))
            .map(urlResult => ({
            ...this.buildUrl(urlResult),
            name: this.buildName(ctx, urlResult),
            title: this.buildTitle(ctx, urlResult),
            behaviorHints: {
                bingeGroup: `webstreamr-mbg-${urlResult.meta?.sourceId}-${urlResult.meta?.extractorId}-${urlResult.meta?.countryCodes?.join('_')}`,
                ...(urlResult.format !== types_1.Format.mp4 && { notWebReady: true }),
                ...(urlResult.requestHeaders !== undefined && {
                    notWebReady: true,
                    proxyHeaders: { request: urlResult.requestHeaders },
                }),
                ...(urlResult.meta?.bytes && { videoSize: urlResult.meta.bytes }),
            },
        })));
        const ttl = sourceErrorCount === 0 ? this.determineTtl(urlResults) : undefined;
        return {
            streams,
            ...(ttl && { ttl }),
        };
    }
    ;
    arraysIntersect(arr1, arr2) {
        return arr1.filter(item => arr2.includes(item)).length > 0;
    }
    determineTtl(urlResults) {
        if (!urlResults.length) {
            return 900000; // 15m
        }
        return Math.min(...urlResults.map(urlResult => urlResult.ttl));
    }
    ;
    buildUrl(urlResult) {
        /* istanbul ignore if */
        if (urlResult.ytId) {
            return { ytId: urlResult.ytId };
        }
        if (!urlResult.isExternal) {
            return { url: urlResult.url.href };
        }
        return { externalUrl: urlResult.url.href };
    }
    ;
    buildName(ctx, urlResult) {
        let name = (0, env_1.envGetAppName)();
        urlResult.meta?.countryCodes?.forEach((countryCode) => {
            name += ` ${(0, language_1.flagFromCountryCode)(countryCode)}`;
        });
        if (urlResult.meta?.height) {
            name += ` ${(0, resolution_1.getClosestResolution)(urlResult.meta.height)}`;
        }
        if (urlResult.isExternal && (0, config_1.showExternalUrls)(ctx.config)) {
            name += ` ⚠️ external`;
        }
        return name;
    }
    ;
    buildTitle(ctx, urlResult) {
        const titleLines = [];
        if (urlResult.meta?.title) {
            titleLines.push(urlResult.meta.title);
        }
        const titleDetailsLine = [];
        if (urlResult.meta?.bytes) {
            titleDetailsLine.push(`💾 ${bytes_1.default.format(urlResult.meta.bytes, { unitSeparator: ' ' })}`);
        }
        const sourceLabel = urlResult.meta?.sourceLabel;
        if (sourceLabel && sourceLabel !== urlResult.label) {
            titleDetailsLine.push(`🔗 ${urlResult.label} from ${urlResult.meta?.sourceLabel}`);
        }
        else {
            titleDetailsLine.push(`🔗 ${urlResult.label}`);
        }
        titleLines.push(titleDetailsLine.join(' '));
        if (urlResult.error) {
            titleLines.push((0, error_1.logErrorAndReturnNiceString)(ctx, this.logger, urlResult.meta?.sourceId ?? '', urlResult.error));
        }
        return titleLines.join('\n');
    }
    ;
}
exports.StreamResolver = StreamResolver;
