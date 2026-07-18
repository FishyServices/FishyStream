import { resolveAniListEpisodeAddress, resolveAniListId } from "../anime/anilistResolver.js";
import { getPosterUrl, getStillUrl } from "./imageHelpers.js";
import { getYear } from "./metadataHelpers.js";
import { mapTmdbSeasonToCanonicalPayload, hasEpisodes } from "./seasonHelpers.js";
import { tmdbGet } from "./serverFetch.js";
import type {
  TMDBSeasonDetails,
  TMDBListItem,
  TMDBListResponse,
  CanonicalSeasonPayload
} from "./types.js";
import { getTvOrderingOverride } from "../anime/tvSeasonMappings.js";

export interface AniListEpisodeMapping {
  episodeNumber: number;
  anilistId: string;
  anilistEpisodeNumber: number;
}

export type SyncType = "movies" | "tv";

export type SyncFlags = {
  trending: boolean;
  popular: boolean;
  new: boolean;
  featured: boolean;
};

export function getEmptyFlags(): SyncFlags {
  return { trending: false, popular: false, new: false, featured: false };
}

export function mergeFlags(a: SyncFlags, b: Partial<SyncFlags>): SyncFlags {
  return {
    trending: a.trending || !!b.trending,
    popular: a.popular || !!b.popular,
    new: a.new || !!b.new,
    featured: a.featured || !!b.featured
  };
}

export function getCatalogEndpoint(type: SyncType, page: number): string {
  const base = `page=${page}&include_adult=false&sort_by=popularity.desc&vote_count.gte=25`;
  return type === "movies" ? `/discover/movie?${base}&include_video=false` : `/discover/tv?${base}`;
}

export async function collectFlagMap(
  type: SyncType,
  pages: number
): Promise<Map<number, SyncFlags>> {
  const merged = new Map<number, SyncFlags>();
  const sources =
    type === "movies"
      ? [
          {
            ep: "/trending/movie/week",
            flags: { trending: true, featured: true } as Partial<SyncFlags>
          },
          { ep: "/movie/popular", flags: { popular: true } as Partial<SyncFlags> },
          { ep: "/movie/now_playing", flags: { new: true } as Partial<SyncFlags> },
          { ep: "/movie/top_rated", flags: {} as Partial<SyncFlags> }
        ]
      : [
          {
            ep: "/trending/tv/week",
            flags: { trending: true, featured: true } as Partial<SyncFlags>
          },
          { ep: "/tv/popular", flags: { popular: true } as Partial<SyncFlags> },
          { ep: "/tv/on_the_air", flags: { new: true } as Partial<SyncFlags> },
          { ep: "/tv/top_rated", flags: {} as Partial<SyncFlags> }
        ];

  for (const src of sources) {
    for (let p = 1; p <= pages; p++) {
      const data = await tmdbGet<TMDBListResponse<TMDBListItem>>(src.ep, { page: String(p) });
      if (!data?.results?.length) break;
      for (const item of data.results) {
        merged.set(item.id, mergeFlags(merged.get(item.id) ?? getEmptyFlags(), src.flags));
      }
    }
  }
  return merged;
}

export async function buildAniListEpisodeMappings(args: {
  anilistId?: string | null;
  title?: string;
  season: number;
  seasonTitle?: string;
  year?: number;
  episodes: Array<{ episodeNumber: number }>;
}): Promise<AniListEpisodeMapping[] | undefined> {
  if (!args.anilistId || args.episodes.length === 0) return undefined;

  const mappings = await Promise.all(
    args.episodes.map(async (episode) => {
      const address = await resolveAniListEpisodeAddress({
        anilistId: args.anilistId,
        title: args.title,
        season: args.season,
        seasonTitle: args.seasonTitle,
        year: args.year,
        episode: episode.episodeNumber
      });
      return address
        ? {
            episodeNumber: episode.episodeNumber,
            anilistId: address.anilistId,
            anilistEpisodeNumber: address.episode
          }
        : null;
    })
  );

  const valid = mappings.filter((m): m is AniListEpisodeMapping => !!m);
  return valid.length > 0 ? valid : undefined;
}

export async function buildCanonicalSeasonPayload(
  tmdbId: string,
  seasonNumber: number,
  override = getTvOrderingOverride(tmdbId)
): Promise<CanonicalSeasonPayload | null> {
  const seasonDef = override?.canonicalSeasons.find((s) => s.seasonNumber === seasonNumber);

  if (!seasonDef) {
    const data = await tmdbGet<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
    if (!data) return null;
    return mapTmdbSeasonToCanonicalPayload(data, data.season_number);
  }

  const data = await tmdbGet<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${seasonDef.sourceSeason}`);
  if (!data) return null;

  const startIndex = Math.max(0, seasonDef.sourceEpisodeStart - 1);
  let sourceData = data;
  let slicedEpisodes = (sourceData.episodes ?? []).slice(
    startIndex,
    startIndex + seasonDef.episodeCount
  );

  if (slicedEpisodes.length === 0 && seasonDef.sourceSeason !== seasonNumber) {
    const direct = await tmdbGet<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
    if (hasEpisodes(direct)) {
      sourceData = direct;
      slicedEpisodes = sourceData.episodes.slice(0, seasonDef.episodeCount);
    }
  }

  if (slicedEpisodes.length === 0) return null;

  const airDate = slicedEpisodes[0]?.air_date ?? sourceData.air_date ?? undefined;
  const isSplit =
    seasonDef.sourceSeason !== seasonDef.seasonNumber || seasonDef.sourceEpisodeStart !== 1;

  return {
    seasonNumber,
    name: isSplit ? `Season ${seasonNumber}` : sourceData.name,
    overview: sourceData.overview || undefined,
    posterUrl: sourceData.poster_path ? getPosterUrl(sourceData.poster_path) : undefined,
    airDate,
    episodeCount: slicedEpisodes.length,
    year: getYear(airDate),
    episodes: slicedEpisodes.map((ep, i) => ({
      episodeNumber: i + 1,
      name: ep.name,
      overview: ep.overview || undefined,
      stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
      airDate: ep.air_date ?? undefined,
      runtime: ep.runtime ?? undefined,
      voteAverage: ep.vote_average
    }))
  };
}

export type EpisodeGroupRaw = {
  order: number;
  name: string;
  episodes: Array<{
    air_date: string | null;
    name: string;
    overview: string;
    runtime: number | null;
    still_path: string | null;
    vote_average: number;
  }>;
};

export function buildEpisodeGroupEpisodes(group: EpisodeGroupRaw): Array<{
  episodeNumber: number;
  name: string;
  overview?: string;
  stillUrl?: string;
  airDate?: string;
  runtime?: number;
  voteAverage: number;
}> {
  return group.episodes.map((ep, i) => ({
    episodeNumber: i + 1,
    name: ep.name,
    overview: ep.overview || undefined,
    stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
    airDate: ep.air_date ?? undefined,
    runtime: ep.runtime ?? undefined,
    voteAverage: ep.vote_average
  }));
}

export async function resolveSeasonAniListId(args: {
  title?: string;
  seasonNumber: number;
  seasonTitle?: string;
  year?: number;
}): Promise<string | null> {
  return resolveAniListId({
    title: args.title,
    season: args.seasonNumber,
    seasonTitle: args.seasonTitle,
    year: args.year
  });
}
