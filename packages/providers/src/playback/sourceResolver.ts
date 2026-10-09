import {
  buildMovieSources,
  buildTvFallbackSources,
  buildTvSources,
  getProviderByKey,
  groupSourcesByProviderCategory,
  pickPreferredSource,
  type SourceBuilder
} from "../streaming/index.js";
import { getSeasonYear } from "./episodes.js";

export interface PlaybackSourceResolver extends SourceBuilder {
  groupSources: typeof groupSourcesByProviderCategory;
  pickSource: typeof pickPreferredSource;
  getProvider: typeof getProviderByKey;
  getSeasonYear: typeof getSeasonYear;
}

export const providerSourceResolver: PlaybackSourceResolver = {
  buildMovieSources,
  buildTvFallbackSources,
  buildTvSources,
  groupSources: groupSourcesByProviderCategory,
  pickSource: pickPreferredSource,
  getProvider: getProviderByKey,
  getSeasonYear
};
