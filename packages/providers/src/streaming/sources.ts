import { resolveAniListEpisodeAddress } from "../anime/anilist/resolver.js";
import type { AniListEpisodeAddress, AniListEpisodeQuery } from "../anime/anilist/types.js";
import type { AniListEpisodeMapping } from "../anime/episodes/mappings.js";
import { createTMDBClient } from "../metadata/tmdb/client.js";
import type { SeasonDetail } from "../metadata/types.js";
import { getDirectVideoUrl, mapCanonicalToProviderOrder } from "../ordering/index.js";
import { memoizeAsync, withTimeout } from "../shared/async.js";
import { buildProviderSources, DEFAULT_SERVER } from "./define.js";
import { getProviderId, STREAM_PROVIDERS } from "./registry.js";
import type { AnimeIdKind, AnimeUrlBuilder, ProviderCatalogEntry, StreamSource } from "./types.js";

const ANILIST_LOOKUP_TIMEOUT_MS = 6000;

const defaultTmdb = createTMDBClient();

export interface MovieSourceRequest {
  imdbId?: string;
  tmdbId?: string;
  isAnime?: boolean;
  anilistId?: string;
  providerIdType?: AnimeIdKind;
  title?: string;
  year?: number;
  dub?: boolean;
}

export interface TvFallbackSourceRequest {
  imdbId?: string;
  tmdbId?: string;
  season: number;
  episode: number;
}

export interface TvSourceRequest extends TvFallbackSourceRequest {
  isAnime?: boolean;
  title?: string;
  seasonTitle?: string;
  year?: number;
  anilistId?: string;
  providerIdType?: AnimeIdKind;
  anilistEpisodeMappings?: AniListEpisodeMapping[];
  dub?: boolean;
}

export interface SourceBuilderDependencies {
  getSeasonDetail: (tmdbId: string, seasonNumber: number) => Promise<SeasonDetail | null>;
  resolveAddress: (query: AniListEpisodeQuery) => Promise<AniListEpisodeAddress | null>;
}

export interface SourceBuilder {
  buildMovieSources(request: MovieSourceRequest): Promise<StreamSource[]>;
  buildTvSources(request: TvSourceRequest): Promise<StreamSource[]>;
  buildTvFallbackSources(request: TvFallbackSourceRequest): StreamSource[];
}

interface AnimeRoute {
  useMal: boolean;
  build: AnimeUrlBuilder;
}

function resolveAnimeRoute(
  provider: ProviderCatalogEntry,
  kind: AnimeIdKind
): AnimeRoute | undefined {
  if (kind === "mal" && provider.getMalAnimeTVUrl) {
    return { useMal: true, build: provider.getMalAnimeTVUrl };
  }
  if (provider.getAnimeTVUrl && provider.animeIdType === "anilist") {
    return { useMal: false, build: provider.getAnimeTVUrl };
  }
  return undefined;
}

function dedupeSources(sources: StreamSource[]): StreamSource[] {
  const unique = new Map<string, StreamSource>();
  for (const source of sources) {
    const key = `${source.key}:${source.url}`;
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()];
}

export function createSourceBuilder(
  dependencies: SourceBuilderDependencies = {
    getSeasonDetail: (tmdbId, seasonNumber) => defaultTmdb.seasonEpisodes(tmdbId, seasonNumber),
    resolveAddress: resolveAniListEpisodeAddress
  }
): SourceBuilder {
  const loadEpisodeOffset = memoizeAsync(
    async (tmdbId: string, season: number): Promise<number> => {
      const requested = await dependencies.getSeasonDetail(tmdbId, season);
      if (requested?.episodes.length) {
        return Math.max(0, (requested.episodes[0]?.episodeNumber ?? 1) - 1);
      }
      const first = await dependencies.getSeasonDetail(tmdbId, 1);
      if (!first) throw new Error("TMDB season data unavailable");
      return first.episodes.length;
    },
    (tmdbId, season) => `${tmdbId}:${season}`
  );

  async function episodeOffset(tmdbId: string | undefined, season: number): Promise<number> {
    if (!tmdbId || season <= 1) return 0;
    try {
      return await loadEpisodeOffset(tmdbId, season);
    } catch {
      return 0;
    }
  }

  async function lookupAddress(
    query: AniListEpisodeQuery
  ): Promise<AniListEpisodeAddress | undefined> {
    try {
      return (
        (await withTimeout(dependencies.resolveAddress(query), ANILIST_LOOKUP_TIMEOUT_MS)) ??
        undefined
      );
    } catch {
      return undefined;
    }
  }

  async function buildMovieSources(request: MovieSourceRequest): Promise<StreamSource[]> {
    const { imdbId, tmdbId, isAnime, anilistId, providerIdType = "anilist", title, year } = request;
    const dub = request.dub ?? false;

    let animeAddress: AniListEpisodeAddress | undefined;
    if (isAnime) {
      animeAddress =
        anilistId && providerIdType !== "mal"
          ? { anilistId, episode: 1 }
          : await lookupAddress({ anilistId, title, season: 1, year, episode: 1 });
    }

    const sources = STREAM_PROVIDERS.flatMap((provider) => {
      if (provider.animeOnly) {
        const route = resolveAnimeRoute(provider, providerIdType);
        const id = route?.useMal ? animeAddress?.malId : animeAddress?.anilistId;
        return route && id ? buildProviderSources(provider, route.build(id, 1, 1, dub)) : [];
      }
      const id = getProviderId(provider, imdbId, tmdbId);
      return id ? buildProviderSources(provider, provider.getMovieUrl(id)) : [];
    });

    return dedupeSources(sources);
  }

  function buildTvFallbackSources(request: TvFallbackSourceRequest): StreamSource[] {
    const { imdbId, tmdbId, season, episode } = request;
    const sources = STREAM_PROVIDERS.flatMap((provider) => {
      const id = provider.animeOnly ? null : getProviderId(provider, imdbId, tmdbId);
      if (!id) return [];
      const mapped = mapCanonicalToProviderOrder(tmdbId, provider.name, { season, episode });
      return buildProviderSources(provider, provider.getTVUrl(id, mapped.season, mapped.episode));
    });
    return dedupeSources(sources);
  }

  async function buildTvSources(request: TvSourceRequest): Promise<StreamSource[]> {
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
      year
    } = request;
    const dub = request.dub ?? false;
    const sources: StreamSource[] = [];

    const directUrl = getDirectVideoUrl(tmdbId, season, episode);
    if (directUrl) {
      sources.push({ key: "direct", name: "Direct", url: directUrl, server: DEFAULT_SERVER });
    }

    const stored = anilistEpisodeMappings?.find((mapping) => mapping.episodeNumber === episode);
    const offset =
      isAnime && !anilistEpisodeMappings?.length && !anilistId
        ? await episodeOffset(tmdbId, season)
        : 0;
    const requested = { season: offset > 0 ? 1 : season, episode: episode + offset };
    const target = mapCanonicalToProviderOrder(tmdbId, "AniList", requested);

    let pendingAddress: Promise<AniListEpisodeAddress | undefined> | undefined;
    const loadAnimeAddress = (): Promise<AniListEpisodeAddress | undefined> => {
      if (stored && providerIdType === "anilist") {
        return Promise.resolve({
          anilistId: stored.anilistId,
          episode: stored.anilistEpisodeNumber
        });
      }
      return lookupAddress({
        anilistId: stored?.anilistId ?? anilistId,
        title,
        season: target.season,
        seasonTitle,
        year,
        episode: stored?.anilistEpisodeNumber ?? target.episode
      });
    };

    for (const provider of STREAM_PROVIDERS) {
      if (provider.animeOnly && !isAnime) continue;

      const route = isAnime ? resolveAnimeRoute(provider, providerIdType) : undefined;
      if (route) {
        pendingAddress ??= loadAnimeAddress();
        const address = await pendingAddress;
        const id = route.useMal ? address?.malId : address?.anilistId;
        if (!address || !id) continue;
        const mapped = mapCanonicalToProviderOrder(tmdbId, provider.name, requested);
        sources.push(
          ...buildProviderSources(provider, route.build(id, mapped.season, address.episode, dub))
        );
        continue;
      }

      const id = getProviderId(provider, imdbId, tmdbId);
      if (!id) continue;
      const mapped = mapCanonicalToProviderOrder(tmdbId, provider.name, { season, episode });
      sources.push(
        ...buildProviderSources(provider, provider.getTVUrl(id, mapped.season, mapped.episode))
      );
    }

    return dedupeSources(sources);
  }

  return { buildMovieSources, buildTvSources, buildTvFallbackSources };
}

const defaultBuilder = createSourceBuilder();

export const { buildMovieSources, buildTvSources, buildTvFallbackSources } = defaultBuilder;
