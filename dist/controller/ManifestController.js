"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManifestController = void 0;
const express_1 = require("express");
const utils_1 = require("../utils");
class ManifestController {
    router;
    sources;
    extractors;
    constructor(sources, extractors) {
        this.router = (0, express_1.Router)();
        this.sources = sources;
        this.extractors = extractors;
        this.router.get('/manifest.json', this.getManifest.bind(this));
        this.router.get('/:config/manifest.json', this.getManifest.bind(this));
    }
    getManifest(req, res) {
        const config = JSON.parse(req.params['config'] || JSON.stringify((0, utils_1.getDefaultConfig)()));
        const manifest = (0, utils_1.buildManifest)(this.sources, this.extractors, config);
        res.setHeader('Content-Type', 'application/json');
        res.send(manifest);
    }
    ;
}
exports.ManifestController = ManifestController;
