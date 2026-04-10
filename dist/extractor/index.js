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
exports.createExtractors = void 0;
const utils_1 = require("../utils");
const DoodStream_1 = require("./DoodStream");
const Dropload_1 = require("./Dropload");
const ExternalUrl_1 = require("./ExternalUrl");
const Fastream_1 = require("./Fastream");
const FileLions_1 = require("./FileLions");
const FileMoon_1 = require("./FileMoon");
const Fsst_1 = require("./Fsst");
const HubCloud_1 = require("./HubCloud");
const HubDrive_1 = require("./HubDrive");
const KinoGer_1 = require("./KinoGer");
const LuluStream_1 = require("./LuluStream");
const Mixdrop_1 = require("./Mixdrop");
const RgShows_1 = require("./RgShows");
const SaveFiles_1 = require("./SaveFiles");
const StreamEmbed_1 = require("./StreamEmbed");
const Streamtape_1 = require("./Streamtape");
const SuperVideo_1 = require("./SuperVideo");
const Uqload_1 = require("./Uqload");
const Vidora_1 = require("./Vidora");
const VidSrc_1 = require("./VidSrc");
const VixSrc_1 = require("./VixSrc");
const Voe_1 = require("./Voe");
const YouTube_1 = require("./YouTube");
__exportStar(require("./Extractor"), exports);
__exportStar(require("./ExtractorRegistry"), exports);
const createExtractors = (fetcher) => {
    const disabledExtractors = (0, utils_1.envGet)('DISABLED_EXTRACTORS')?.split(',') ?? [];
    const hubCloud = new HubCloud_1.HubCloud(fetcher);
    return [
        new DoodStream_1.DoodStream(fetcher),
        new Dropload_1.Dropload(fetcher),
        new Fastream_1.Fastream(fetcher),
        new FileLions_1.FileLions(fetcher),
        new FileMoon_1.FileMoon(fetcher),
        new Fsst_1.Fsst(fetcher),
        hubCloud,
        new HubDrive_1.HubDrive(fetcher, hubCloud),
        new KinoGer_1.KinoGer(fetcher),
        new LuluStream_1.LuluStream(fetcher),
        new Mixdrop_1.Mixdrop(fetcher),
        new RgShows_1.RgShows(fetcher),
        new SaveFiles_1.SaveFiles(fetcher),
        new StreamEmbed_1.StreamEmbed(fetcher),
        new Streamtape_1.Streamtape(fetcher),
        new SuperVideo_1.SuperVideo(fetcher),
        new Uqload_1.Uqload(fetcher),
        new Vidora_1.Vidora(fetcher),
        new VidSrc_1.VidSrc(fetcher, [
            'vidsrcme.ru',
            'vidsrcme.su',
            'vidsrc-me.ru',
            'vidsrc-me.su',
            'vidsrc-embed.ru',
            'vidsrc-embed.su',
            'vsrc.su',
        ]),
        new VixSrc_1.VixSrc(fetcher),
        new Voe_1.Voe(fetcher),
        new YouTube_1.YouTube(fetcher),
        new ExternalUrl_1.ExternalUrl(fetcher), // fallback extractor which must come last
    ].filter(extractor => !disabledExtractors.includes(extractor.id));
};
exports.createExtractors = createExtractors;
