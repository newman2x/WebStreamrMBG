"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findHeight = exports.getClosestResolution = exports.RESOLUTIONS = void 0;
exports.RESOLUTIONS = [
    '2160p',
    '1440p',
    '1080p',
    '720p',
    '576p',
    '480p',
    '360p',
    '240p',
    '144p',
    'Unknown',
];
const getClosestResolution = (height) => {
    if (!height) {
        return 'Unknown';
    }
    return `${exports.RESOLUTIONS.map(r => Number(r.replace('p', '')))
        .filter(n => !isNaN(n))
        .reduce((prev, curr) => {
        return Math.abs(curr - height) < Math.abs(prev - height) ? curr : prev;
    })}p`;
};
exports.getClosestResolution = getClosestResolution;
const findHeight = (value) => {
    /* istanbul ignore next */
    const height = parseInt(exports.RESOLUTIONS.find(res => value.toLowerCase().includes(res))?.replace('p', '') ?? '', 10);
    /* istanbul ignore next */
    return isNaN(height) ? undefined : height;
};
exports.findHeight = findHeight;
