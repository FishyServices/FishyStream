import {
  buildMovieSources,
  buildTvSources,
  getProviderByKey,
  type ProviderCatalogEntry,
  type StreamSource
} from "../catalog/providerCatalog.js";
import {
  getSeasonYear,
  groupSourcesByProviderCategory,
  pickPreferredSource,
  type ProviderGroupedSources
} from "./providerPlayback.js";

export interface PlaybackSourceResolver {
  buildMovieSources(args: { imdbId?: string; tmdbId?: string }): StreamSource[];
  buildTvSources(args: Parameters<typeof buildTvSources>[0]): Promise<StreamSource[]>;
  groupSources(sources: StreamSource[]): ProviderGroupedSources[];
  pickSource(
    sources: StreamSource[],
    options: { initialSource?: string; defaultProvider?: string }
  ): StreamSource | undefined;
  getProvider(key: string): ProviderCatalogEntry | undefined;
  getSeasonYear(airDate?: string): number | undefined;
}

export const providerSourceResolver: PlaybackSourceResolver = {
  buildMovieSources,
  buildTvSources,
  groupSources: groupSourcesByProviderCategory,
  pickSource: pickPreferredSource,
  getProvider: getProviderByKey,
  getSeasonYear
};
