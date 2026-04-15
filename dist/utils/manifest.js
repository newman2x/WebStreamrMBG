"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildManifest = void 0;
const types_1 = require("../types");
const config_1 = require("./config");
const env_1 = require("./env");
const language_1 = require("./language");
const resolution_1 = require("./resolution");
const typedEntries = (obj) => Object.entries(obj);
const buildManifest = (sources, extractors, config) => {
    const manifest = {
        id: (0, env_1.envGetAppId)(),
        version: '0.70.1', // x-release-please-version
        name: (0, env_1.envGetAppName)(),
        description: 'Provides HTTP URLs from streaming websites. Configure add-on for additional languages. Add MediaFlow proxy for more URLs.',
        resources: [
            'stream',
        ],
        types: [
            'movie',
            'series',
        ],
        catalogs: [],
        idPrefixes: ['tmdb:', 'tt'],
        logo: 'https://emojiapi.dev/api/v1/spider_web/256.png',
        behaviorHints: {
            p2p: false,
            configurable: true,
            configurationRequired: false,
        },
        config: [],
        stremioAddonsConfig: {
            issuer: 'https://stremio-addons.net',
            signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..h1oW2E0XXKLldUqO-ReSUA.fejuyGAvmc_CdT9dnq2srZCgoC42ak-Rqeo7IKsEN3DPRpz8x-hmvbuBI_7BUU2PsFMSni35m_Lv0teUNQDPvlrm7t1FCZINMR4ty_Hee6If5m6J4kSzafD75HhWvxFU.FAcDZ5qZrTPDeRAVOUI2tQ',
        },
    };
    sources.sort((sourceA, sourceB) => sourceA.label.localeCompare(sourceB.label));
    const countryCodeSources = {};
    sources.forEach(source => source.countryCodes
        .forEach(countryCode => countryCodeSources[countryCode] = [...(countryCodeSources[countryCode] ?? []), source]));
    const sortedLanguageSources = typedEntries(countryCodeSources)
        .sort(([countryCodeA], [countryCodeB]) => {
        if (countryCodeB === types_1.CountryCode.multi) {
            return 1;
        }
        return countryCodeA.localeCompare(countryCodeB);
    });
    const languages = [];
    for (const [countryCode, sources] of sortedLanguageSources) {
        const language = (0, language_1.languageFromCountryCode)(countryCode);
        languages.push(language);
        manifest.config.push({
            key: countryCode,
            type: 'checkbox',
            title: `${language} ${(0, language_1.flagFromCountryCode)(countryCode)} (${sources.map(source => source.label).sort().join(', ')})`,
            ...(countryCode in config && { default: 'checked' }),
        });
    }
    manifest.config.push({
        key: 'showErrors',
        type: 'checkbox',
        title: 'Show errors',
        ...('showErrors' in config && { default: 'checked' }),
    });
    manifest.config.push({
        key: 'includeExternalUrls',
        type: 'checkbox',
        title: 'Include external URLs in results',
        ...('includeExternalUrls' in config && { default: 'checked' }),
    });
    manifest.config.push({
        key: 'mediaFlowProxyUrl',
        type: 'text',
        title: 'MediaFlow Proxy URL',
        default: config['mediaFlowProxyUrl'] ?? '',
    });
    manifest.config.push({
        key: 'mediaFlowProxyPassword',
        type: 'password',
        title: 'MediaFlow Proxy Password',
        default: config['mediaFlowProxyPassword'] ?? '',
    });
    resolution_1.RESOLUTIONS.forEach((resolution) => {
        manifest.config.push({
            key: (0, config_1.excludeResolutionConfigKey)(resolution),
            type: 'checkbox',
            title: `Exclude resolution ${resolution}`,
            ...((0, config_1.isResolutionExcluded)(config, resolution) && { default: 'checked' }),
        });
    });
    extractors.forEach((extractor) => {
        if (extractor.id === 'external') {
            return;
        }
        manifest.config.push({
            key: (0, config_1.disableExtractorConfigKey)(extractor),
            type: 'checkbox',
            title: `Disable extractor ${extractor.label}`,
            ...((0, config_1.isExtractorDisabled)(config, extractor) && { default: 'checked' }),
        });
    });
    manifest.description += `\n\nSupported languages: ${languages.filter(language => language !== 'Multi').join(', ')}`;
    manifest.description += `\n\nSupported sources: ${sources.map(source => source.label).join(', ')}`;
    manifest.description += `\n\nSupported extractors: ${extractors.map(extractor => extractor.label).join(', ')}`;
    return manifest;
};
exports.buildManifest = buildManifest;
