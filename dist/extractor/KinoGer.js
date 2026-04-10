"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KinoGer = void 0;
const crypto_1 = __importDefault(require("crypto"));
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
/** @see https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/kinoger.py */
class KinoGer extends Extractor_1.Extractor {
    id = 'kinoger';
    label = 'KinoGer';
    ttl = 21600000; // 6h
    supports(_ctx, url) {
        return [
            'asianembed.cam',
            'disneycdn.net',
            'dzo.vidplayer.live',
            'filedecrypt.link',
            'filma365.strp2p.site',
            'flimmer.rpmvip.com',
            'flixfilmesonline.strp2p.site',
            'kinoger.p2pplay.pro',
            'kinoger.re',
            'moflix.rpmplay.xyz',
            'moflix.upns.xyz',
            'player.upn.one',
            'securecdn.shop',
            'shiid4u.upn.one',
            'srbe84.vidplayer.live',
            'strp2p.site',
            't1.p2pplay.pro',
            'tuktuk.rpmvid.com',
            'ultrastream.online',
            'videoland.cfd',
            'videoshar.uns.bio',
            'w1tv.xyz',
            'wasuytm.store',
        ].includes(url.host);
    }
    normalize(url) {
        return new URL(`${url.origin}/api/v1/video?id=${url.hash.slice(1)}`);
    }
    async extractInternal(ctx, url, meta) {
        const headers = {
            'Origin': url.origin,
            'Referer': url.origin + '/',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        };
        const hexData = await this.fetcher.text(ctx, url, { headers });
        const encrypted = Buffer.from(hexData.slice(0, -1), 'hex');
        const key = Buffer.from('6b69656d7469656e6d75613931316361', 'hex');
        const iv = Buffer.from('313233343536373839306f6975797472', 'hex');
        const decipher = crypto_1.default.createDecipheriv('aes-128-cbc', key, iv);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
        const { source, title } = JSON.parse(decrypted);
        const m3u8Url = new URL(source);
        return [
            {
                url: m3u8Url,
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    height: meta.height ?? await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, m3u8Url, { headers }),
                    title,
                },
                requestHeaders: headers,
            },
        ];
    }
    ;
}
exports.KinoGer = KinoGer;
