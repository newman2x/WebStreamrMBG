"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigureController = void 0;
const express_1 = require("express");
const landingTemplate_1 = require("../landingTemplate");
const utils_1 = require("../utils");
class ConfigureController {
    router;
    sources;
    extractors;
    constructor(sources, extractors) {
        this.router = (0, express_1.Router)();
        this.sources = sources;
        this.extractors = extractors;
        this.router.get('/configure', this.getConfigure.bind(this));
        this.router.get('/:config/configure', this.getConfigure.bind(this));
    }
    getConfigure(req, res) {
        const config = JSON.parse(req.params['config'] || JSON.stringify((0, utils_1.getDefaultConfig)()));
        // Convenience preset for ElfHosted WebStreamrMBG bundle including Media Flow Proxy
        if (!req.params['config'] && (0, utils_1.isElfHostedInstance)(req)) {
            config.mediaFlowProxyUrl = `${req.protocol}://${req.host.replace('webstreamr-mbg', 'mediaflow-proxy')}`;
        }
        const manifest = (0, utils_1.buildManifest)(this.sources, this.extractors, config);
        res.setHeader('content-type', 'text/html');
        res.send((0, landingTemplate_1.landingTemplate)(manifest));
    }
    ;
}
exports.ConfigureController = ConfigureController;
