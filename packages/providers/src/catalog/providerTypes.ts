export type ProviderKey =
  | "111movies"
  | "2embed"
  | "cinesrc"
  | "cinezo"
  | "direct"
  | "filmu"
  | "megaplay"
  | "peachify"
  | "tryembed"
  | "vaplayer"
  | "vidcore"
  | "videasy"
  | "vidfast"
  | "vidlove"
  | "vidlux"
  | "vidnest"
  | "vidrock"
  | "vidsrc"
  | "vidsrcpro"
  | "vidup"
  | "vidzee"
  | "vidzen"
  | "vixsrc"
  | "zxcstream"
  | "zokoanime";

export type ProviderCategory = "primary" | "primary_anime" | "other";
export type ProviderIdType = "tmdb" | "imdb" | "both";
export type AnimeIdType = "same" | "anilist";
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
  statusRequest?: boolean;
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
  unsafeWildcardOrigin?: boolean;
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
  getAnimeTVUrl?: (
    id: string,
    season: number,
    episode: number,
    dub?: boolean,
    params?: ProviderUrlParams<TParams>
  ) => string;
  getMalAnimeTVUrl?: (
    id: string,
    season: number,
    episode: number,
    dub?: boolean,
    params?: ProviderUrlParams<TParams>
  ) => string;
}

export interface StreamSource {
  key: ProviderKey;
  name: string;
  url: string;
  server: ProviderServer;
}
