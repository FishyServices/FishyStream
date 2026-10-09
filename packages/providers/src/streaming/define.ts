import type {
  AnimePath,
  MoviePath,
  ProviderCatalogEntry,
  ProviderParamsDef,
  ProviderServer,
  StreamSource,
  TvPath
} from "./types.js";

export interface PathBuilders {
  moviePath: MoviePath;
  tvPath: TvPath;
}

export type ProviderDefinition<TParams extends ProviderParamsDef> = Omit<
  ProviderCatalogEntry<TParams>,
  "getMovieUrl" | "getTVUrl" | "getAnimeTVUrl" | "getMalAnimeTVUrl" | "origins" | "website"
> &
  PathBuilders & {
    website: string;
    origins?: string[];
    animePath?: AnimePath;
    malAnimePath?: AnimePath;
  };

export const DEFAULT_SERVER: ProviderServer = { id: "default", label: "Default" };

export const embedPaths: PathBuilders = {
  moviePath: (id) => `/embed/movie/${id}`,
  tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
};

export const plainPaths: PathBuilders = {
  moviePath: (id) => `/movie/${id}`,
  tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
};

export const dubQueryPath =
  (prefix: string): AnimePath =>
  (id, _season, episode, dub) =>
    `${prefix}/${id}/${episode}${dub ? "?dub=true" : ""}`;

export const languageSegmentPath =
  (prefix: string): AnimePath =>
  (id, _season, episode, dub) =>
    `${prefix}/${id}/${episode}/${dub ? "dub" : "sub"}`;

export function animeOnlyPaths(animePath: AnimePath, dub = false): PathBuilders {
  return {
    moviePath: (id) => animePath(id, 1, 1, dub),
    tvPath: (id, season, episode) => animePath(id, season, episode, dub)
  };
}

function resolveUrl(website: string, path: string, params?: Record<string, unknown>): string {
  const url = new URL(`${website}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function defineProvider<TParams extends ProviderParamsDef>(
  definition: ProviderDefinition<TParams>
): ProviderCatalogEntry<TParams> {
  const { moviePath, tvPath, animePath, malAnimePath, website, origins, ...metadata } = definition;
  const baseUrl = website.replace(/\/+$/, "");

  return {
    ...metadata,
    website: baseUrl,
    origins: origins ?? [new URL(baseUrl).origin],
    getMovieUrl: (id, params) => resolveUrl(baseUrl, moviePath(id), params),
    getTVUrl: (id, season, episode, params) =>
      resolveUrl(baseUrl, tvPath(id, season, episode), params),
    getAnimeTVUrl: animePath
      ? (id, season, episode, dub, params) =>
          resolveUrl(baseUrl, animePath(id, season, episode, dub), params)
      : undefined,
    getMalAnimeTVUrl: malAnimePath
      ? (id, season, episode, dub, params) =>
          resolveUrl(baseUrl, malAnimePath(id, season, episode, dub), params)
      : undefined
  };
}

export function buildProviderSources(provider: ProviderCatalogEntry, url: string): StreamSource[] {
  const servers = provider.servers ?? [{ id: "default", label: provider.name }];
  return servers.map((server) => {
    const target = new URL(url);
    if (server.value && provider.serverParam)
      target.searchParams.set(provider.serverParam, server.value);
    return { key: provider.key, name: server.label, url: target.toString(), server };
  });
}

export const BASE_PLAYER_PARAMS: ProviderParamsDef = {
  title: { type: "boolean", default: true },
  poster: { type: "boolean", default: true },
  autoPlay: { type: "boolean", default: false },
  startAt: { type: "time" },
  theme: { type: "hex" },
  server: { type: "string" },
  hideServer: { type: "boolean", default: false },
  fullscreenButton: { type: "boolean", default: true },
  chromecast: { type: "boolean", default: true },
  sub: { type: "string" }
};

export const STANDARD_EMBED_PLAYER_PARAMS: ProviderParamsDef = {
  ...BASE_PLAYER_PARAMS,
  nextButton: { type: "boolean", default: true },
  autoNext: { type: "boolean", default: false }
};

export const VIDCORE_PLAYER_PARAMS: ProviderParamsDef = BASE_PLAYER_PARAMS;
