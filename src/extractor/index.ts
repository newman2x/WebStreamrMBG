import winston from 'winston';
import { envGet, Fetcher } from '../utils';
import { DoodStream } from './DoodStream';
import { Dropload } from './Dropload';
import { ExternalUrl } from './ExternalUrl';
import { Extractor } from './Extractor';
import { Fastream } from './Fastream';
import { FileLions } from './FileLions';
import { FileMoon } from './FileMoon';
import { Fsst } from './Fsst';
import { HBLinks } from './HBLinks';
import { HDStream4U } from './HDStream4U';
import { HubCloud } from './HubCloud';
import { HubDrive } from './HubDrive';
import { KinoGer } from './KinoGer';
import { LuluStream } from './LuluStream';
import { Mixdrop } from './Mixdrop';
import { MovieBox } from './MovieBox';
import { RgShows } from './RgShows';
import { SaveFiles } from './SaveFiles';
import { StreamEmbed } from './StreamEmbed';
import { Streamtape } from './Streamtape';
import { SuperVideo } from './SuperVideo';
import { Uqload } from './Uqload';
import { Vidara } from './Vidara';
import { Vidsonic } from './Vidsonic';
import { VidSrc } from './VidSrc';
import { Vidzee } from './Vidzee';
import { VixSrc } from './VixSrc';
import { Voe } from './Voe';
import { YouTube } from './YouTube';

export * from './Extractor';
export * from './ExtractorRegistry';

export const createExtractors = (fetcher: Fetcher, logger: winston.Logger): Extractor[] => {
  const disabledExtractors = envGet('DISABLED_EXTRACTORS')?.split(',') ?? [];

  const hubCloud = new HubCloud(fetcher, logger);
  const hubDrive = new HubDrive(fetcher, logger, hubCloud);

  return [
    new DoodStream(fetcher, logger),
    new Dropload(fetcher, logger),
    new Fastream(fetcher, logger),
    new FileLions(fetcher, logger),
    new FileMoon(fetcher, logger),
    new Fsst(fetcher, logger),
    new HBLinks(fetcher, logger, hubDrive, hubCloud),
    new HDStream4U(fetcher, logger),
    hubCloud,
    hubDrive,
    new KinoGer(fetcher, logger),
    new LuluStream(fetcher, logger),
    new Mixdrop(fetcher, logger),
    new MovieBox(fetcher, logger),
    new RgShows(fetcher, logger),
    new SaveFiles(fetcher, logger),
    new StreamEmbed(fetcher, logger),
    new Streamtape(fetcher, logger),
    new SuperVideo(fetcher, logger),
    new Uqload(fetcher, logger),
    new Vidara(fetcher, logger),
    new Vidsonic(fetcher, logger),
    new Vidzee(fetcher, logger),
    new VidSrc(fetcher, logger, [ // https://vidsrc.domains/
      'vidsrcme.ru',
      'vidsrcme.su',
      'vidsrc-me.ru',
      'vidsrc-me.su',
      'vsembed.ru',
      'vsembed.su',
      'vsrc.su',
    ]),
    new VixSrc(fetcher, logger),
    new Voe(fetcher, logger),
    new YouTube(fetcher, logger),
    new ExternalUrl(fetcher, logger), // fallback extractor which must come last
  ].filter(extractor => !disabledExtractors.includes(extractor.id));
};
