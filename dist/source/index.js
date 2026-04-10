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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSources = void 0;
const utils_1 = require("../utils");
const CineHDPlus_1 = require("./CineHDPlus");
const Cuevana_1 = require("./Cuevana");
const Einschalten_1 = require("./Einschalten");
const Eurostreaming_1 = require("./Eurostreaming");
const FourKHDHub_1 = require("./FourKHDHub");
const Frembed_1 = require("./Frembed");
const FrenchCloud_1 = require("./FrenchCloud");
const HDHub4u_1 = require("./HDHub4u");
const HomeCine_1 = require("./HomeCine");
const KinoGer_1 = require("./KinoGer");
const Kokoshka_1 = require("./Kokoshka");
const MegaKino_1 = require("./MegaKino");
const MeineCloud_1 = require("./MeineCloud");
const MostraGuarda_1 = require("./MostraGuarda");
const Movix_1 = require("./Movix");
const RgShows_1 = require("./RgShows");
const StreamKiste_1 = require("./StreamKiste");
const VerHdLink_1 = require("./VerHdLink");
const VidSrc_1 = require("./VidSrc");
const VixSrc_1 = require("./VixSrc");
__exportStar(require("./Source"), exports);
const createSources = (fetcher) => {
    const disabledSources = (0, utils_1.envGet)('DISABLED_SOURCES')?.split(',') ?? [];
    return [
        // multi
        new FourKHDHub_1.FourKHDHub(fetcher),
        new HDHub4u_1.HDHub4u(fetcher),
        new VixSrc_1.VixSrc(fetcher),
        new VidSrc_1.VidSrc(),
        new RgShows_1.RgShows(fetcher),
        // AL
        new Kokoshka_1.Kokoshka(fetcher),
        // ES / MX
        new CineHDPlus_1.CineHDPlus(fetcher),
        new Cuevana_1.Cuevana(fetcher),
        new HomeCine_1.HomeCine(fetcher),
        new VerHdLink_1.VerHdLink(fetcher),
        // DE
        new Einschalten_1.Einschalten(fetcher),
        new KinoGer_1.KinoGer(fetcher),
        new MegaKino_1.MegaKino(fetcher),
        new MeineCloud_1.MeineCloud(fetcher),
        new StreamKiste_1.StreamKiste(fetcher),
        // FR
        new Frembed_1.Frembed(fetcher),
        new FrenchCloud_1.FrenchCloud(fetcher),
        new Movix_1.Movix(fetcher),
        // IT
        new Eurostreaming_1.Eurostreaming(fetcher),
        new MostraGuarda_1.MostraGuarda(fetcher),
    ].filter(source => !disabledSources.includes(source.id));
};
exports.createSources = createSources;
