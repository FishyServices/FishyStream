import type {
  ProviderCatalogEntry,
  ProviderParamsDef,
  ProviderServer,
  ProviderUrlParams,
  StreamSource
} from "./providerTypes.js";

type ProviderDefinition<TParams extends ProviderParamsDef> = Omit<
  ProviderCatalogEntry<TParams>,
  | "getMovieUrl"
  | "getTVUrl"
  | "getAnimeTVUrl"
  | "getMalAnimeTVUrl"
  | "origins"
  | "unsafeWildcardOrigin"
> & {
  origins?: string[];
  moviePath: (id: string) => string;
  tvPath: (id: string, season: number, episode: number) => string;
  animePath?: (id: string, season: number, episode: number, dub?: boolean) => string;
  malAnimePath?: (id: string, season: number, episode: number, dub?: boolean) => string;
};

function providerOriginFromWebsite(website?: string) {
  if (!website?.startsWith("http://") && !website?.startsWith("https://")) return undefined;
  try {
    return new URL(website).origin;
  } catch {
    return undefined;
  }
}

function resolveUrl(
  baseUrl: string | undefined,
  path: string,
  params?: ProviderUrlParams<ProviderParamsDef>
) {
  let url = path;
  if (
    baseUrl &&
    !path.startsWith("/api/") &&
    !path.startsWith("http://") &&
    !path.startsWith("https://")
  ) {
    url = `${baseUrl}${path}`;
  }

  if (!params || Object.keys(params).length === 0) return url;

  try {
    const parsed = new URL(url, url.startsWith("http") ? undefined : "http://localhost");
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        parsed.searchParams.set(key, String(value));
      }
    }
    return url.startsWith("http") ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function defineProvider<TParams extends ProviderParamsDef>(
  definition: ProviderDefinition<TParams>
): ProviderCatalogEntry<TParams> {
  const {
    moviePath,
    tvPath,
    animePath,
    malAnimePath,
    website,
    params,
    origins: rawOrigins,
    ...metadata
  } = definition;
  const baseUrl = website?.replace(/\/+$/, "");
  const origin = providerOriginFromWebsite(website);
  const origins = rawOrigins ?? ["*"];
  const unsafeWildcardOrigin = origins.length === 1 && origins[0] === "*" && !origin;
  const resolvedOrigins = origins.length === 1 && origins[0] === "*" && origin ? [origin] : origins;

  return {
    ...metadata,
    params,
    website,
    origins: resolvedOrigins,
    unsafeWildcardOrigin,
    getMovieUrl: (id, urlParams) => resolveUrl(baseUrl, moviePath(id), urlParams),
    getTVUrl: (id, season, episode, urlParams) =>
      resolveUrl(baseUrl, tvPath(id, season, episode), urlParams),
    getAnimeTVUrl: animePath
      ? (id, season, episode, dub, urlParams) =>
          resolveUrl(baseUrl, animePath(id, season, episode, dub), urlParams)
      : undefined,
    getMalAnimeTVUrl: malAnimePath
      ? (id, season, episode, dub, urlParams) =>
          resolveUrl(baseUrl, malAnimePath(id, season, episode, dub), urlParams)
      : undefined
  };
}

function resolveServerUrl(url: string, parameter: string | undefined, server: ProviderServer) {
  if (!server.value || !parameter) return url;
  try {
    const parsed = new URL(url, url.startsWith("http") ? undefined : "http://localhost");
    parsed.searchParams.set(parameter, server.value);
    return url.startsWith("http") ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function buildProviderSources(provider: ProviderCatalogEntry, url: string): StreamSource[] {
  const servers = provider.servers ?? [{ id: "default", label: provider.name }];
  return servers.map((server) => ({
    key: provider.key,
    name: server.label,
    url: resolveServerUrl(url, provider.serverParam, server),
    server
  }));
}

export const STANDARD_EMBED_PLAYER_PARAMS: ProviderParamsDef = {
  title: { type: "boolean", default: true },
  poster: { type: "boolean", default: true },
  autoPlay: { type: "boolean", default: false },
  startAt: { type: "time" },
  theme: { type: "hex" },
  server: { type: "string" },
  hideServer: { type: "boolean", default: false },
  fullscreenButton: { type: "boolean", default: true },
  chromecast: { type: "boolean", default: true },
  sub: { type: "string" },
  nextButton: { type: "boolean", default: true },
  autoNext: { type: "boolean", default: false }
};

export const VIDCORE_PLAYER_PARAMS: ProviderParamsDef = {
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
