import type { MediaType } from "../shared/media.js";

export type ProviderKey =
  | "111movies"
  | "2embed"
  | "aniembed"
  | "cinesrc"
  | "cinezo"
  | "direct"
  | "filmu"
  | "megavid"
  | "megaplay"
  | "peachify"
  | "tryembed"
  | "vaplayer"
  | "vidbolt"
  | "vidcore"
  | "videasy"
  | "vidfast"
  | "vidhawk"
  | "vidlove"
  | "vidlux"
  | "vidnest"
  | "vidrock"
  | "vidsrc"
  | "vidsrcpro"
  | "vidup"
  | "vidy"
  | "vidzee"
  | "vidzen"
  | "vixsrc"
  | "zokoanime"
  | "zxcstream";

export type ProviderCategory = "primary" | "primary_anime" | "other";
export type ProviderIdType = "tmdb" | "imdb" | "both";
export type AnimeIdType = "same" | "anilist";
export type AnimeIdKind = "anilist" | "mal";
export type ProviderParamType = "boolean" | "string" | "number" | "hex" | "time";

export type ProviderReferrerPolicy =
  | "no-referrer"
  | "unsafe-url"
  | "origin"
  | "origin-when-cross-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin";

export interface ProviderProgressConfig {
  resumeParam?: "progress" | "startAt" | "time";
  controlApi?: boolean;
  forceStartPosition?: boolean;
  resumeContentTypes?: readonly MediaType[];
}

export interface ProviderServer {
  id: string;
  label: string;
  value?: string;
}

export interface ProviderParamDef {
  type: ProviderParamType;
  default?: boolean | string | number;
}

export type ProviderParamsDef = Record<string, ProviderParamDef>;
export type ProviderUrlParams<TParams extends ProviderParamsDef> = Partial<
  Record<keyof TParams, boolean | string | number>
>;

export type MoviePath = (id: string) => string;
export type TvPath = (id: string, season: number, episode: number) => string;
export type AnimePath = (id: string, season: number, episode: number, dub?: boolean) => string;

export type AnimeUrlBuilder<TParams extends ProviderParamsDef = ProviderParamsDef> = (
  id: string,
  season: number,
  episode: number,
  dub?: boolean,
  params?: ProviderUrlParams<TParams>
) => string;

export interface ProviderCatalogEntry<TParams extends ProviderParamsDef = ProviderParamsDef> {
  key: ProviderKey;
  name: string;
  category: ProviderCategory;
  idType: ProviderIdType;
  website?: string;
  animeOnly?: boolean;
  animeIdType?: AnimeIdType;
  dubSupport?: boolean;
  origins: string[];
  referrerPolicy?: ProviderReferrerPolicy;
  progress?: ProviderProgressConfig;
  canBeScraped?: boolean;
  serverParam?: string;
  servers?: readonly ProviderServer[];
  params?: TParams;
  getMovieUrl: (id: string, params?: ProviderUrlParams<TParams>) => string;
  getTVUrl: (
    id: string,
    season: number,
    episode: number,
    params?: ProviderUrlParams<TParams>
  ) => string;
  getAnimeTVUrl?: AnimeUrlBuilder<TParams>;
  getMalAnimeTVUrl?: AnimeUrlBuilder<TParams>;
}

export interface StreamSource {
  key: ProviderKey;
  name: string;
  url: string;
  server: ProviderServer;
}
