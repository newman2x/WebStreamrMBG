import { envGet, Fetcher } from '../utils';
import { AniWorld } from './AniWorld';
import { BurningSeries } from './BurningSeries';
import { CineHDPlus } from './CineHDPlus';
import { Cuevana } from './Cuevana';
import { Einschalten } from './Einschalten';
import { Eurostreaming } from './Eurostreaming';
import { FilmpalastTO } from './FilmpalastTO';
import { FourKHDHub } from './FourKHDHub';
import { Frembed } from './Frembed';
import { FrenchCloud } from './FrenchCloud';
import { HDFilme } from './HDFilme';
import { HDHub4u } from './HDHub4u';
import { HomeCine } from './HomeCine';
import { KinoGer } from './KinoGer';
import { Kokoshka } from './Kokoshka';
import { MegaKino } from './MegaKino';
import { MeineCloud } from './MeineCloud';
import { MostraGuarda } from './MostraGuarda';
import { MovieBox } from './MovieBox';
import { Movix } from './Movix';
import { Netzkino } from './Netzkino';
import { SerienStream } from './SerienStream';
import { Source } from './Source';
import { VerHdLink } from './VerHdLink';
import { VidSrc } from './VidSrc';
import { Vidzee } from './Vidzee';
import { VixSrc } from './VixSrc';

export * from './Source';

export const createSources = (fetcher: Fetcher): Source[] => {
  const disabledSources = envGet('DISABLED_SOURCES')?.split(',') ?? [];

  return [
    // multi
    new FourKHDHub(fetcher),
    new HDHub4u(fetcher),
    new VixSrc(fetcher),
    new VidSrc(),
    new Vidzee(fetcher),
    new MovieBox(fetcher),
    // AL
    new Kokoshka(fetcher),
    // ES / MX
    new CineHDPlus(fetcher),
    new Cuevana(fetcher),
    new HomeCine(fetcher),
    new VerHdLink(fetcher),
    // DE
    new Einschalten(fetcher),
    new KinoGer(fetcher),
    new MegaKino(fetcher),
    new MeineCloud(fetcher),
    new FilmpalastTO(fetcher),
    new SerienStream(fetcher),
    new AniWorld(fetcher),
    new HDFilme(fetcher),
    new BurningSeries(fetcher),
    new Netzkino(fetcher),
    // FR
    new Frembed(fetcher),
    new FrenchCloud(fetcher),
    new Movix(fetcher),
    // IT
    new Eurostreaming(fetcher),
    new MostraGuarda(fetcher),
  ].filter(source => !disabledSources.includes(source.id));
};

