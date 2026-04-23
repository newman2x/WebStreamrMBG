# WebStreamrMBG

[![Tests](https://github.com/newman2x/WebStreamrMBG/actions/workflows/tests.yml/badge.svg)](https://github.com/newman2x/WebStreamrMBG/actions/workflows/tests.yml)
[![GitHub release](https://img.shields.io/github/v/release/newman2x/WebStreamrMBG)](https://github.com/newman2x/WebStreamrMBG/releases)
![GitHub License](https://img.shields.io/github/license/newman2x/WebStreamrMBG)

> **WebStreamrMBG** is a fork of [WebStreamr](https://github.com/webstreamr/webstreamr) with redesigned config UI.

[Stremio](https://www.stremio.com/) add-on which provides HTTP URLs from streaming websites.

HTTP streams have limitations.
For a better experience, I'd advise using a Debrid service and WebStreamrMBG as fallback.
[TorBox](https://torbox.app/subscription?referral=10c5caa4-4be7-424c-a92f-ae01bad60cda) is working very well.

## Public Instance

| Instance | URL |
|----------|-----|
| Stable | https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club |

## Known issues / limitations

- PixelServer / pixeldrain has a daily limit of 6 GB per IP: https://pixeldrain.dev
- Dropload and SuperVideo on Android do not work because Stremio does not use the `Referer` header properly via HLS playlists: https://github.com/Stremio/stremio-bugs/issues/2389, maybe https://github.com/Stremio/stremio-bugs/issues/1579
- MediaFlow proxy has to be used in an inefficient way because Stremio on Android or its players cannot deal with HLS playlist with redirects: https://github.com/Stremio/stremio-bugs/issues/1574
- FlareSolverr cookies cannot be used because Cloudflare does techniques like TLS fingerprinting most likely. But FlareSolverr uses a session per host and should be quick.
- RgShows detects shared usage and blocks IPs. It therefore only works on private instances.

## MediaFlow Proxy

[MediaFlow Proxy](https://github.com/mhdzumair/mediaflow-proxy/) can be added when configuring the add-on to gain access to a couple of more file hosters.
It depends highly on the language / source used if that unlocks more streams or not.

MediaFlow proxy is needed because some hosters ip-lock streams and the add-on does not run on the same device that will stream the video.

The following hosters can be used only with MediaFlow Proxy:

- Fastream
- FileLions
- FileMoon
- LuluStream
- Mixdrop
- Streamtape
- VOE

## Environment variables

#### `CACHE_DIR`

Optional. Directory for persistent caches using SQLite files. Default: OS tmp dir.

#### `CONFIGURATION_DESCRIPTION`

Optional. To customize the description shown on the configuration page.

#### `DISABLED_EXTRACTORS`

Optional. Comma separated list of extractors which should be disabled. E.g. `doodstream,vidsrc`

#### `DISABLED_SOURCES`

Optional. Comma separated list of sources which should be disabled. E.g. `frembed,vidsrc`

#### `FLARESOLVERR_ENDPOINT`

Optional. If domains show Cloudflare challenges, FlareSolverr can be used to work around them. E.g. `http://flaresolverr:8191`

#### `MANIFEST_ID`

Optional. Add-on manifest ID. Default: `webstreamr-mbg`

#### `MANIFEST_NAME`

Optional. Add-on manifest name. Default: `WebStreamrMBG`

#### `PORT`

Optional. Port of the node web server. Default: `51546`

#### `PROXY_CONFIG`

Optional. Proxies which should be used based on domain. Supports minimatch. E.g. `dood.to:http://USERNAME:PASSWORD@IP:PORT,*:socks5://172.17.0.1:1080`

#### `TMDB_ACCESS_TOKEN`

**Required**. TMDB access token to get information like title and year for content. Use the [API Read Access Token](https://www.themoviedb.org/settings/api).
