"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Voe = void 0;
const bytes_1 = __importDefault(require("bytes"));
const cheerio = __importStar(require("cheerio"));
const error_1 = require("../error");
const types_1 = require("../types");
const utils_1 = require("../utils");
const Extractor_1 = require("./Extractor");
/** @see https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/voesx.py */
class Voe extends Extractor_1.Extractor {
    id = 'voe';
    label = 'VOE';
    viaMediaFlowProxy = true;
    supports(ctx, url) {
        const supportedDomain = null !== url.host.match(/voe/)
            || [
                '19turanosephantasia.com',
                '20demidistance9elongations.com',
                '30sensualizeexpression.com',
                '321naturelikefurfuroid.com',
                '35volitantplimsoles5.com',
                '449unceremoniousnasoseptal.com',
                '745mingiestblissfully.com',
                'adrianmissionminute.com',
                'alleneconomicmatter.com',
                'antecoxalbobbing1010.com',
                'apinchcaseation.com',
                'audaciousdefaulthouse.com',
                'availedsmallest.com',
                'bigclatterhomesguideservice.com',
                'boonlessbestselling244.com',
                'bradleyviewdoctor.com',
                'brittneystandardwestern.com',
                'brucevotewithin.com',
                'christopheruntilpoint.com',
                'chromotypic.com',
                'chuckle-tube.com',
                'cindyeyefinal.com',
                'counterclockwisejacky.com',
                'crownmakermacaronicism.com',
                'crystaltreatmenteast.com',
                'cyamidpulverulence530.com',
                'diananatureforeign.com',
                'donaldlineelse.com',
                'edwardarriveoften.com',
                'erikcoldperson.com',
                'figeterpiazine.com',
                'fittingcentermondaysunday.com',
                'fraudclatterflyingcar.com',
                'gamoneinterrupted.com',
                'generatesnitrosate.com',
                'goofy-banana.com',
                'graceaddresscommunity.com',
                'greaseball6eventual20.com',
                'guidon40hyporadius9.com',
                'heatherdiscussionwhen.com',
                'housecardsummerbutton.com',
                'jamessoundcost.com',
                'jamiesamewalk.com',
                'jasminetesttry.com',
                'jayservicestuff.com',
                'jennifercertaindevelopment.com',
                'jilliandescribecompany.com',
                'johnalwayssame.com',
                'jonathansociallike.com',
                'josephseveralconcern.com',
                'kathleenmemberhistory.com',
                'kellywhatcould.com',
                'kennethofficialitem.com',
                'kinoger.ru',
                'kristiesoundsimply.com',
                'lancewhosedifficult.com',
                'launchreliantcleaverriver.com',
                'lauradaydo.com',
                'lisatrialidea.com',
                'loriwithinfamily.com',
                'lukecomparetwo.com',
                'lukesitturn.com',
                'mariatheserepublican.com',
                'matriculant401merited.com',
                'maxfinishseveral.com',
                'metagnathtuggers.com',
                'michaelapplysome.com',
                'mikaylaarealike.com',
                'nathanfromsubject.com',
                'nectareousoverelate.com',
                'nonesnanking.com',
                'paulkitchendark.com',
                'realfinanceblogcenter.com',
                'rebeccaneverbase.com',
                'reputationsheriffkennethsand.com',
                'richardsignfish.com',
                'roberteachfinal.com',
                'robertordercharacter.com',
                'robertplacespace.com',
                'sandratableother.com',
                'sandrataxeight.com',
                'scatch176duplicities.com',
                'sethniceletter.com',
                'shannonpersonalcost.com',
                'simpulumlamerop.com',
                'smoki.cc',
                'stevenimaginelittle.com',
                'strawberriesporail.com',
                'telyn610zoanthropy.com',
                'timberwoodanotia.com',
                'toddpartneranimal.com',
                'toxitabellaeatrebates306.com',
                'uptodatefinishconferenceroom.com',
                'v-o-e-unblock.com',
                'valeronevijao.com',
                'walterprettytheir.com',
                'wolfdyslectic.com',
                'yodelswartlike.com',
            ].includes(url.host);
        return supportedDomain && (0, utils_1.supportsMediaFlowProxy)(ctx);
    }
    normalize(url) {
        return new URL(`/${url.pathname.replace(/\/+$/, '').split('/').at(-1)}`, url);
    }
    async extractInternal(ctx, url, meta) {
        const headers = { Referer: meta.referer ?? url.href };
        let html;
        try {
            html = await this.fetcher.text(ctx, url, { headers });
        }
        catch (error) {
            /* istanbul ignore next */
            if (error instanceof error_1.NotFoundError && !url.href.includes('/e/')) {
                return await this.extractInternal(ctx, new URL(`/e${url.pathname}`, url.origin), meta);
            }
            /* istanbul ignore next */
            throw error;
        }
        const redirectMatch = html.match(/window\.location\.href\s*=\s*'([^']+)/);
        if (redirectMatch && redirectMatch[1]) {
            return await this.extractInternal(ctx, new URL(redirectMatch[1]), meta);
        }
        if (/An error occurred during encoding/.test(html)) {
            throw new error_1.NotFoundError();
        }
        const $ = cheerio.load(html);
        const title = $('meta[name="description"]').attr('content')?.trim().replace(/^Watch /, '').replace(/ at VOE$/, '').trim();
        const sizeMatch = html.matchAll(/[\d.]+ ?[GM]B/g).toArray().at(-1);
        const size = sizeMatch ? bytes_1.default.parse(sizeMatch[0]) : /* istanbul ignore next */ null;
        const playlistUrl = await (0, utils_1.buildMediaFlowProxyExtractorStreamUrl)(ctx, this.fetcher, 'Voe', url, headers);
        const heightMatch = html.match(/<b>(\d{3,})p<\/b>/);
        const height = heightMatch
            ? parseInt(heightMatch[1])
            : meta.height ?? await (0, utils_1.guessHeightFromPlaylist)(ctx, this.fetcher, playlistUrl);
        return [
            {
                url: playlistUrl,
                format: types_1.Format.hls,
                meta: {
                    ...meta,
                    height,
                    title,
                    ...(size && size > 16777216 && { bytes: size }),
                },
            },
        ];
    }
    ;
}
exports.Voe = Voe;
