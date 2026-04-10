"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextFromRequestAndResponse = void 0;
const config_1 = require("./config");
const contextFromRequestAndResponse = (req, res) => {
    return {
        hostUrl: new URL(`${req.protocol}://${req.host}`),
        id: res.getHeader('X-Request-ID'),
        ...(req.ip && { ip: req.ip }),
        config: req.params['config'] ? JSON.parse(req.params['config']) : (0, config_1.getDefaultConfig)(),
    };
};
exports.contextFromRequestAndResponse = contextFromRequestAndResponse;
