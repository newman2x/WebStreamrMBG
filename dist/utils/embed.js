"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractUrlFromPacked = exports.unpackEval = void 0;
const unpacker_1 = require("unpacker");
const unpackEval = (html) => {
    const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\).*\)\)/);
    if (!evalMatch) {
        throw new Error(`No p.a.c.k.e.d string found`);
    }
    return (0, unpacker_1.unpack)(evalMatch[0]);
};
exports.unpackEval = unpackEval;
const extractUrlFromPacked = (html, linkRegExps) => {
    const unpacked = (0, exports.unpackEval)(html);
    for (const linkRegexp of linkRegExps) {
        const linkMatch = unpacked.match(linkRegexp);
        if (linkMatch && linkMatch[1]) {
            return new URL(`https://${linkMatch[1].replace(/^(https:)?\/\//, '')}`);
        }
    }
    throw new Error(`Could not find a stream link in embed`);
};
exports.extractUrlFromPacked = extractUrlFromPacked;
