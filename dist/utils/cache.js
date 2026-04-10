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
exports.clearCache = exports.createKeyvSqlite = void 0;
/* istanbul ignore file */
const node_fs_1 = __importDefault(require("node:fs"));
const os = __importStar(require("node:os"));
// eslint-disable-next-line import/no-named-as-default
const sqlite_1 = __importDefault(require("@keyv/sqlite"));
const cacheable_1 = require("cacheable");
const glob_1 = require("glob");
const sqlite3 = __importStar(require("sqlite3"));
const env_1 = require("./env");
const getCacheDir = () => (0, env_1.envGet)('CACHE_DIR') ?? os.tmpdir();
const scheduleKeyvSqliteCleanup = (keyvSqlite) => {
    const filename = keyvSqlite.opts.db;
    if ((0, env_1.envIsTest)() || !filename || !node_fs_1.default.existsSync(filename)) {
        return;
    }
    setInterval(() => {
        const db = new sqlite3.Database(filename);
        db.serialize(() => {
            db.run('DELETE FROM keyv WHERE json_extract(value, \'$.expires\') <= (strftime(\'%s\', \'now\') * 1000)');
        });
        db.close();
    }, 60 * 60 * 1000); // every hour
};
const createKeyvSqlite = (name) => {
    const cacheDir = getCacheDir();
    if ((0, env_1.envIsTest)() || !cacheDir) {
        return new cacheable_1.KeyvCacheableMemory();
    }
    const keyvSqlite = new sqlite_1.default(`sqlite://${cacheDir}/webstreamr-mbg-${name}.sqlite`);
    scheduleKeyvSqliteCleanup(keyvSqlite);
    return keyvSqlite;
};
exports.createKeyvSqlite = createKeyvSqlite;
const clearCache = async (logger) => {
    for (const file of await (0, glob_1.glob)(`${getCacheDir()}/webstreamr-mbg*`)) {
        logger.info(`Delete cache file ${file}`);
        node_fs_1.default.rmSync(file);
    }
};
exports.clearCache = clearCache;
