"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Einschalten = void 0;
const types_1 = require("../types");
const utils_1 = require("../utils");
const Source_1 = require("./Source");
class Einschalten extends Source_1.Source {
    id = 'einschalten';
    label = 'Einschalten';
    contentTypes = ['movie'];
    countryCodes = [types_1.CountryCode.de];
    baseUrl = 'https://einschalten.in';
    fetcher;
    constructor(fetcher) {
        super();
        this.fetcher = fetcher;
    }
    async handleInternal(ctx, _type, id) {
        const tmdbId = await (0, utils_1.getTmdbId)(ctx, this.fetcher, id);
        const { releaseName: title, streamUrl } = await this.fetcher.json(ctx, new URL(`/api/movies/${tmdbId.id}/watch`, this.baseUrl));
        return [{ url: new URL(streamUrl), meta: { countryCodes: [types_1.CountryCode.de], referer: (new URL(`/movies/${tmdbId.id}`, this.baseUrl)).href, title } }];
    }
    ;
}
exports.Einschalten = Einschalten;
