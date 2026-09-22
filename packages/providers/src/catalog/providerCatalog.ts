import { resolveAniListEpisodeAddress } from "../anime/anilistResolver.js";
import { mapCanonicalToProviderOrder, getTvOrderingOverride } from "../anime/tvSeasonMappings.js";
import type { AniListEpisodeMapping } from "../types.js";
import { fetchTmdbSeasonEpisodes, TMDB_API_KEY } from "../tmdb/client.js";
import { buildProviderSources } from "./providerDefinition.js";
import type {
  ProviderCatalogEntry,
  ProviderCategory,
  ProviderKey,
  StreamSource
} from "./providerTypes.js";
import { STREAM_PROVIDERS } from "./providerRegistry.js";
export type {
  AnimeIdType,
  ProviderCatalogEntry,
  ProviderCategory,
  ProviderIdType,
  ProviderKey,
  ProviderParamDef,
  ProviderParamsDef,
  ProviderParamType,
  ProviderProgressConfig,
  ProviderReferrerPolicy,
  ProviderServer,
  ProviderUrlParams,
  StreamSource
} from "./providerTypes.js";
export { STREAM_PROVIDERS } from "./providerRegistry.js";

const automaticEpisodeOffsetCache = new Map<string, Promise<number>>();

async function getAutomaticEpisodeOffset(tmdbId: string | undefined, season: number) {
  if (!tmdbId || season <= 1) return 0;
  const key = `${tmdbId}:${season}`;
  const cached = automaticEpisodeOffsetCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    const requestedSeason = await fetchTmdbSeasonEpisodes(tmdbId, season, TMDB_API_KEY);
    if (requestedSeason?.episodes.length) {
      const firstEpisodeNumber = requestedSeason.episodes[0]?.episodeNumber ?? 1;
      return Math.max(0, firstEpisodeNumber - 1);
    }
    const firstSeason = await fetchTmdbSeasonEpisodes(tmdbId, 1, TMDB_API_KEY);
    return firstSeason?.episodes.length ?? 0;
  })();
  automaticEpisodeOffsetCache.set(key, pending);
  return pending;
}

const PROVIDER_MAP: ReadonlyMap<ProviderKey, ProviderCatalogEntry> = (() => {
  const map = new Map<ProviderKey, ProviderCatalogEntry>();
  for (const provider of STREAM_PROVIDERS) {
    if (map.has(provider.key)) {
      throw new Error(`Duplicate provider key in STREAM_PROVIDERS: ${provider.key}`);
    }
    map.set(provider.key, provider);
  }
  return map;
})();

const ORIGIN_MAP: ReadonlyMap<string, ProviderCatalogEntry> = (() => {
  const map = new Map<string, ProviderCatalogEntry>();
  for (const provider of STREAM_PROVIDERS) {
    for (const origin of provider.origins) {
      if (origin === "*" || map.has(origin)) continue;
      map.set(origin, provider);
    }
  }
  return map;
})();

const WILDCARD_PROVIDER: ProviderCatalogEntry | undefined = STREAM_PROVIDERS.find(
  (provider) => provider.origins.includes("*") && provider.unsafeWildcardOrigin !== true
);

export function getProviderByKey(key: string): ProviderCatalogEntry | undefined {
  const resolvedKey = key as ProviderKey;
  return PROVIDER_MAP.get(resolvedKey);
}

export function getProviderCapabilities(provider: ProviderCatalogEntry): string[] {
  const capabilities = [];

  if (provider.idType === "both") capabilities.push("TMDB/IMDb");
  else capabilities.push(provider.idType.toUpperCase());

  if (provider.getAnimeTVUrl) capabilities.push("Anime");
  if (provider.dubSupport) capabilities.push("Sub/Dub");
  if (provider.progress?.resumeParam) capabilities.push("Resume");

  return capabilities;
}

export function getGroupedProviders(providers: ProviderCatalogEntry[] = STREAM_PROVIDERS) {
  const grouped = new Map<ProviderCategory, ProviderCatalogEntry[]>([
    ["primary", []],
    ["primary_anime", []],
    ["other", []]
  ]);

  for (const provider of providers) {
    grouped.get(provider.category)?.push(provider);
  }

  return [
    { key: "primary" as const, label: "Primary", providers: grouped.get("primary") ?? [] },
    {
      key: "primary_anime" as const,
      label: "Primary Anime",
      providers: grouped.get("primary_anime") ?? []
    },
    {
      key: "other" as const,
      label: "Other Sources",
      providers: grouped.get("other") ?? []
    }
  ].filter((group) => group.providers.length > 0);
}

export function getProviderByOrigin(origin: string): ProviderCatalogEntry | undefined {
  return ORIGIN_MAP.get(origin) ?? WILDCARD_PROVIDER;
}

export function getProviderId(
  provider: ProviderCatalogEntry,
  imdbId?: string,
  tmdbId?: string
): string | null {
  if (provider.idType === "tmdb" && tmdbId) return tmdbId;
  if (provider.idType === "imdb" && imdbId?.startsWith("tt")) return imdbId;
  if (provider.idType === "both") return imdbId || tmdbId || null;
  return null;
}

function dedupeSources(sources: StreamSource[]) {
  const seen = new Set<string>();
  const result: StreamSource[] = [];

  for (const source of sources) {
    const key = `${source.key}:${source.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }

  return result;
}

export function buildMovieSources(args: { imdbId?: string; tmdbId?: string }): StreamSource[] {
  const { imdbId, tmdbId } = args;
  const sources = STREAM_PROVIDERS.flatMap((provider) => {
    if (provider.key === "direct") return [];
    if (provider.animeOnly) return [];

    const id = getProviderId(provider, imdbId, tmdbId);
    if (!id) return [];

    return buildProviderSources(provider, provider.getMovieUrl(id));
  });

  return dedupeSources(sources);
}

export function buildTvFallbackSources(args: {
  imdbId?: string;
  tmdbId?: string;
  season: number;
  episode: number;
}): StreamSource[] {
  const sources = STREAM_PROVIDERS.flatMap((provider) => {
    if (provider.key === "direct" || provider.animeOnly) return [];

    const id = getProviderId(provider, args.imdbId, args.tmdbId);
    if (!id) return [];

    const mapped = mapCanonicalToProviderOrder(args.tmdbId, provider.name, {
      season: args.season,
      episode: args.episode
    });

    return buildProviderSources(provider, provider.getTVUrl(id, mapped.season, mapped.episode));
  });

  return dedupeSources(sources);
}

export async function buildTvSources(args: {
  imdbId?: string;
  isAnime?: boolean;
  season: number;
  episode: number;
  title?: string;
  seasonTitle?: string;
  year?: number;
  tmdbId?: string;
  anilistId?: string;
  providerIdType?: "anilist" | "mal";
  anilistEpisodeMappings?: AniListEpisodeMapping[];
  dub?: boolean;
}): Promise<StreamSource[]> {
  const {
    imdbId,
    tmdbId,
    anilistId,
    providerIdType = "anilist",
    anilistEpisodeMappings,
    season,
    episode,
    isAnime,
    title,
    seasonTitle,
    year,
    dub
  } = args;
  const sources: StreamSource[] = [];
  const automaticEpisodeOffset =
    anilistEpisodeMappings?.length || anilistId
      ? 0
      : await getAutomaticEpisodeOffset(tmdbId, season);
  const requestedAddress = {
    season: automaticEpisodeOffset > 0 ? 1 : season,
    episode: episode + automaticEpisodeOffset
  };

  const override = getTvOrderingOverride(tmdbId);
  const directUrl = override?.videoUrlOverrides?.[`season=${season}&episode=${episode}`];
  if (directUrl) {
    sources.push({
      key: "direct",
      name: "Direct",
      url: directUrl,
      server: { id: "default", label: "Default" }
    });
  }

  const storedAniListAddress = anilistEpisodeMappings?.find(
    (mapping) => mapping.episodeNumber === episode
  );

  let aniListAddressPromise:
    Promise<Awaited<ReturnType<typeof resolveAniListEpisodeAddress>>> | undefined;
  const aniListTarget = mapCanonicalToProviderOrder(tmdbId, "AniList", requestedAddress);
  const getAniListAddress = () => {
    if (!aniListAddressPromise) {
      aniListAddressPromise = storedAniListAddress
        ? Promise.resolve({
            anilistId: storedAniListAddress.anilistId,
            episode: storedAniListAddress.anilistEpisodeNumber
          })
        : resolveAniListEpisodeAddress({
            anilistId,
            title,
            season: aniListTarget.season,
            seasonTitle,
            year,
            episode: aniListTarget.episode
          });
    }
    return aniListAddressPromise;
  };

  const getAniListAddressWithTimeout = async () => {
    try {
      return await Promise.race([
        getAniListAddress(),
        new Promise<undefined>((resolve) => setTimeout(resolve, 6000))
      ]);
    } catch {
      return undefined;
    }
  };

  for (const provider of STREAM_PROVIDERS) {
    if (provider.key === "direct") continue;
    if (provider.animeOnly && !isAnime) continue;

    const fallbackId = getProviderId(provider, imdbId, tmdbId);
    const usesAniList =
      isAnime &&
      ((!!provider.getAnimeTVUrl && provider.animeIdType === "anilist") ||
        (!!provider.getMalAnimeTVUrl && providerIdType === "mal"));
    const aniListAddress = usesAniList ? await getAniListAddressWithTimeout() : undefined;
    const useMalId = !!provider.getMalAnimeTVUrl && providerIdType === "mal";
    const animeId = usesAniList
      ? useMalId
        ? (aniListAddress?.malId ?? null)
        : (aniListAddress?.anilistId ?? null)
      : null;

    const id = animeId ?? fallbackId;
    if (!id) continue;

    const isAnimeMatch =
      isAnime && (!!provider.getAnimeTVUrl || !!provider.getMalAnimeTVUrl) && !!animeId;
    const mappedCanonicalAddress = mapCanonicalToProviderOrder(
      tmdbId,
      provider.name,
      isAnimeMatch ? requestedAddress : { season, episode }
    );
    const mapped = isAnimeMatch
      ? {
          season: mappedCanonicalAddress.season,
          episode: aniListAddress?.episode ?? mappedCanonicalAddress.episode
        }
      : mappedCanonicalAddress;
    const url = isAnimeMatch
      ? (useMalId ? provider.getMalAnimeTVUrl : provider.getAnimeTVUrl)!(
          id,
          mapped.season,
          mapped.episode,
          dub ?? false
        )
      : provider.getTVUrl(id, mapped.season, mapped.episode);

    sources.push(...buildProviderSources(provider, url));
  }

  return dedupeSources(sources);
}
