"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VixSrc = void 0;
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
class VixSrc extends Extractor_1.Extractor {
    id = 'vixsrc';
    label = 'VixSrc';
    ttl = 21600000; // 6h
    supports(_ctx, url) {
        return null !== url.host.match(/vixsrc/);
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: url.href };
        const html = await this.fetcher.text(ctx, url);
        const tokenMatch = html.match(/['"]token['"]: ?['"](.*?)['"]/);
        const expiresMatch = html.match(/['"]expires['"]: ?['"](.*?)['"]/);
        const urlMatch = html.match(/url: ?['"](.*?)['"]/);
        const baseUrl = new URL(`${urlMatch[1]}`);
        const playlistUrl = new URL(`${baseUrl.origin}${baseUrl.pathname}.m3u8?${baseUrl.searchParams}`);
        playlistUrl.searchParams.append('token', tokenMatch[1]);
        playlistUrl.searchParams.append('expires', expiresMatch[1]);
        playlistUrl.searchParams.append('h', '1');
        const countryCodes = meta.countryCodes ?? [types_1.CountryCode.multi, ...(await this.determineCountryCodesFromPlaylist(ctx, playlistUrl, { headers }))];
        if (!(0, utils_1.hasMultiEnabled)(ctx.config) && !countryCodes.some(countryCode => countryCode in ctx.config)) {
            return [];
        }
        return [
            {
                url: playlistUrl,
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    countryCodes,
                    height: meta.height ?? await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, playlistUrl, { headers }),
                },
            },
        ];
    }
    ;
    async determineCountryCodesFromPlaylist(ctx, playlistUrl, init) {
        const playlist = await this.fetcher.text(ctx, playlistUrl, init);
        const countryCodes = [];
        Object.keys(types_1.CountryCode).forEach((countryCode) => {
            const iso639 = (0, utils_1.iso639FromCountryCode)(countryCode);
            if (!countryCodes.includes(countryCode) && (new RegExp(`#EXT-X-MEDIA:TYPE=AUDIO.*LANGUAGE="${iso639}"`)).test(playlist)) {
                countryCodes.push(countryCode);
            }
        });
        return countryCodes;
    }
}
exports.VixSrc = VixSrc;
