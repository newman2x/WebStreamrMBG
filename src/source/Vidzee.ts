import { ContentType } from 'stremio-addon-sdk';
import { Context, CountryCode } from '../types';
import { Fetcher, getTmdbId, Id } from '../utils';
import { Source, SourceResult } from './Source';

interface VidzeeServer {
  sr: string;
  flag: string;
  name: string;
  countryCode: CountryCode;
}

const VIDZEE_SERVERS: VidzeeServer[] = [
  { sr: '3', flag: 'US', name: 'Achilles', countryCode: CountryCode.en },
  { sr: '5', flag: 'US', name: 'Drag', countryCode: CountryCode.en },
  { sr: '6', flag: 'VN', name: 'Viet', countryCode: CountryCode.vi },
  { sr: '7', flag: 'IN', name: 'Hindi', countryCode: CountryCode.hi },
  { sr: '8', flag: 'IN', name: 'Bengali', countryCode: CountryCode.hi },
  { sr: '9', flag: 'IN', name: 'Tamil', countryCode: CountryCode.ta },
  { sr: '10', flag: 'IN', name: 'Telugu', countryCode: CountryCode.te },
  { sr: '11', flag: 'IN', name: 'Malayalam', countryCode: CountryCode.ml },
];

export class Vidzee extends Source {
  public readonly id = 'vidzee';

  public readonly label = 'VidZee';

  public readonly contentTypes: ContentType[] = ['movie', 'series'];

  public readonly countryCodes: CountryCode[] = [CountryCode.multi];

  public readonly baseUrl = 'https://player.vidzee.wtf';

  private readonly fetcher: Fetcher;

  public constructor(fetcher: Fetcher) {
    super();

    this.fetcher = fetcher;
  }

  public async handleInternal(ctx: Context, _type: string, id: Id): Promise<SourceResult[]> {
    const tmdbId = await getTmdbId(ctx, this.fetcher, id);

    const servers = VIDZEE_SERVERS.filter(server =>
      server.countryCode === CountryCode.en || server.countryCode === CountryCode.multi,
    );

    return servers.map((server) => {
      let url: URL;
      if (tmdbId.season) {
        url = new URL(`/v2/embed/tv/${tmdbId.id}/${tmdbId.season}/${tmdbId.episode}`, this.baseUrl);
      } else {
        url = new URL(`/v2/embed/movie/${tmdbId.id}`, this.baseUrl);
      }
      url.searchParams.set('sr', server.sr);

      return {
        url,
        meta: {
          countryCodes: [server.countryCode],
          title: `${server.name} (${server.flag})`,
        },
      };
    });
  }
}
