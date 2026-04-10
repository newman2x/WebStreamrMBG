"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isElfHostedInstance = exports.envIsTest = exports.envIsProd = exports.envGetAppName = exports.envGetAppId = exports.envGetRequired = exports.envGet = void 0;
const envGet = (name) => process.env[name];
exports.envGet = envGet;
const envGetRequired = (name) => {
    const value = (0, exports.envGet)(name);
    if (!value) {
        throw new Error(`Environment variable "${name}" is not configured.`);
    }
    return value;
};
exports.envGetRequired = envGetRequired;
const envGetAppId = () => process.env['MANIFEST_ID'] || 'webstreamr-mbg';
exports.envGetAppId = envGetAppId;
const envGetAppName = () => process.env['MANIFEST_NAME'] || 'WebStreamrMBG';
exports.envGetAppName = envGetAppName;
const envIsProd = () => process.env['NODE_ENV'] === 'production';
exports.envIsProd = envIsProd;
const envIsTest = () => process.env['NODE_ENV'] === 'test';
exports.envIsTest = envIsTest;
const isElfHostedInstance = (req) => req.host.endsWith('elfhosted.com');
exports.isElfHostedInstance = isElfHostedInstance;
