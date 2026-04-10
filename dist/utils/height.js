"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guessHeightFromPlaylist = void 0;
const guessHeightFromPlaylist = async (ctx, fetcher, playlistUrl, init) => {
    const m3u8Data = await fetcher.text(ctx, playlistUrl, init);
    const heights = Array.from(m3u8Data.matchAll(/\d+x(\d+)|(\d+)p/g))
        .map(heightMatch => heightMatch[1] ?? heightMatch[2])
        .filter(height => height !== undefined)
        .map(height => parseInt(height));
    return heights.length ? Math.max(...heights) : /* istanbul ignore next */ undefined;
};
exports.guessHeightFromPlaylist = guessHeightFromPlaylist;
