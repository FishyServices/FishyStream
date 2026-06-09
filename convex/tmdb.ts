"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import {
  getCanonicalSeasonCount,
  getCanonicalTotalEpisodes,
  getTvOrderingOverride
} from "@fishy/providers/tvSeasonMappings";
import { resolveAniListEpisodeAddress, resolveAniListId } from "@fishy/providers/anilistResolver";
import type { AniListEpisodeMapping } from "../shared/contentMetadata";
import {
  TMDB_IMAGE_BASE,
  tmdbGet,
  getPosterUrl,
  getBackdropUrl,
  getStillUrl,
  getProfileUrl,
  getGenres,
  getRating,
  getYear,
  getLogoUrl,
  getTrailerKey,
  isAnimeLikeContent,
  formatRuntime,
  mapInBatches,
  mapTmdbSeasonToCanonicalPayload,
  compactSeasonEpisodesForDb,
  hasEpisodes,
  type TMDBGenre,
  type TMDBVideo,
  type TMDBLogo,
  type TMDBMovieListItem,
  type TMDBTVListItem,
  type TMDBMovieDetails,
  type TMDBTVDetails,
  type TMDBSeasonDetails,
  type TMDBListItem,
  type TMDBListResponse,
  type CanonicalSeasonPayload
} from "@fishy/providers/tmdb";

async function buildAniListEpisodeMappings(args: {
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

async function buildCanonicalSeasonPayload(
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

type SyncType = "movies" | "tv";
type SyncFlags = { trending: boolean; popular: boolean; new: boolean; featured: boolean };

function getEmptyFlags(): SyncFlags {
  return { trending: false, popular: false, new: false, featured: false };
}

function mergeFlags(a: SyncFlags, b: Partial<SyncFlags>): SyncFlags {
  return {
    trending: a.trending || !!b.trending,
    popular: a.popular || !!b.popular,
    new: a.new || !!b.new,
    featured: a.featured || !!b.featured
  };
}

async function collectFlagMap(type: SyncType, pages: number): Promise<Map<number, SyncFlags>> {
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

function getCatalogEndpoint(type: SyncType, page: number): string {
  const base = `page=${page}&include_adult=false&sort_by=popularity.desc&vote_count.gte=25`;
  return type === "movies" ? `/discover/movie?${base}&include_video=false` : `/discover/tv?${base}`;
}

export const syncContent = action({
  args: {
    type: v.union(v.literal("movies"), v.literal("tv")),
    count: v.optional(v.number())
  },
  handler: async (ctx, { type, count = 50 }) => {
    const normalizedCount = Math.max(1, Math.min(count, 2000));
    const requiredPages = Math.ceil(normalizedCount / 20);
    const flagPages = Math.min(10, Math.ceil(requiredPages / 4) + 2);
    const flagMap = await collectFlagMap(type, flagPages);

    const existingContent = await ctx.runQuery(internal.content.getAllTmdbIds, {});
    const existingTmdbIds = new Set(
      existingContent.map((c: { tmdbId?: string }) => c.tmdbId).filter(Boolean)
    );

    const seeds: Array<{
      id: number;
      type: "movie" | "tv";
      title: string;
      overview: string;
      posterPath: string | null;
      backdropPath: string | null;
      releaseDate?: string;
      firstAirDate?: string;
      voteAverage: number;
      voteCount: number;
      popularity: number;
      genreIds: number[];
      originalLanguage: string;
      flags: SyncFlags;
      order: number;
    }> = [];

    let page = 1;
    const maxPages = Math.max(requiredPages, 50);

    while (seeds.length < normalizedCount && page <= maxPages) {
      const data = await tmdbGet<TMDBListResponse<TMDBListItem>>(getCatalogEndpoint(type, page));
      if (!data?.results?.length) break;

      for (const item of data.results) {
        if (existingTmdbIds.has(String(item.id))) continue;
        const isMovie = "title" in item;
        seeds.push({
          id: item.id,
          type: isMovie ? "movie" : "tv",
          title: isMovie ? (item as TMDBMovieListItem).title : (item as TMDBTVListItem).name,
          overview: item.overview,
          posterPath: item.poster_path,
          backdropPath: item.backdrop_path,
          releaseDate: isMovie ? (item as TMDBMovieListItem).release_date : undefined,
          firstAirDate: !isMovie ? (item as TMDBTVListItem).first_air_date : undefined,
          voteAverage: item.vote_average,
          voteCount: item.vote_count ?? 0,
          popularity: item.popularity ?? 0,
          genreIds: item.genre_ids ?? [],
          originalLanguage: (item as any).original_language ?? "en",
          flags: flagMap.get(item.id) ?? getEmptyFlags(),
          order: seeds.length
        });
        if (seeds.length >= normalizedCount) break;
      }
      page++;
      if (page > maxPages && seeds.length === 0) break;
    }

    const now = Date.now();
    const detailLimit = Math.min(120, Math.ceil(seeds.length * 0.2));

    const payloads = await mapInBatches(seeds, 5, async (seed, index) => {
      const wantsDetails =
        index < detailLimit || seed.flags.trending || seed.flags.popular || seed.flags.featured;

      let details: TMDBMovieDetails | TMDBTVDetails | null = null;
      if (wantsDetails) {
        details = await tmdbGet<TMDBMovieDetails | TMDBTVDetails>(
          seed.type === "movie" ? `/movie/${seed.id}` : `/tv/${seed.id}`,
          { append_to_response: "external_ids,videos,images" }
        );
      }

      const md = details as TMDBMovieDetails | null;
      const td = details as TMDBTVDetails | null;
      const genres = getGenres(details ?? { genre_ids: seed.genreIds });
      const originalLanguage = details?.original_language ?? seed.originalLanguage;
      const animeLike = isAnimeLikeContent({ type: seed.type, genres, originalLanguage });
      const resolvedAniListId = animeLike
        ? await resolveAniListId({
            title: seed.title,
            season: 1,
            year: getYear(seed.releaseDate ?? seed.firstAirDate)
          })
        : null;

      const logos = seed.type === "movie" ? md?.images?.logos : td?.images?.logos;
      const videos = seed.type === "movie" ? md?.videos?.results : td?.videos?.results;

      return {
        title: (seed.type === "movie" ? md?.title : td?.name) ?? seed.title,
        description: details?.overview ?? seed.overview ?? "No description available",
        type: seed.type,
        genre: genres,
        year: getYear(
          seed.type === "movie"
            ? (md?.release_date ?? seed.releaseDate)
            : (td?.first_air_date ?? seed.firstAirDate)
        ),
        rating: getRating(details?.vote_average ?? seed.voteAverage),
        voteAverage: details?.vote_average ?? seed.voteAverage,
        voteCount: details?.vote_count ?? seed.voteCount,
        popularity: details?.popularity ?? seed.popularity,
        posterUrl: getPosterUrl(details?.poster_path ?? seed.posterPath),
        backdropUrl: getBackdropUrl(details?.backdrop_path ?? seed.backdropPath),
        logoUrl: getLogoUrl(logos),
        trailerKey: getTrailerKey(videos),
        tmdbId: String(seed.id),
        anilistId: resolvedAniListId ?? undefined,
        imdbId:
          (seed.type === "movie"
            ? (md?.imdb_id ?? md?.external_ids?.imdb_id)
            : td?.external_ids?.imdb_id) || undefined,
        duration:
          seed.type === "movie"
            ? formatRuntime(md?.runtime)
            : formatRuntime(td?.episode_run_time?.[0]),
        seasons:
          seed.type === "tv" ? getCanonicalSeasonCount(seed.id, td?.number_of_seasons) : undefined,
        totalEpisodes:
          seed.type === "tv"
            ? getCanonicalTotalEpisodes(seed.id, td?.number_of_episodes)
            : undefined,
        status: seed.type === "movie" ? md?.status : td?.status,
        tagline: seed.type === "movie" ? md?.tagline || undefined : td?.tagline || undefined,
        originalLanguage,
        trending: seed.flags.trending,
        popular: seed.flags.popular || seed.order < 60,
        new: seed.flags.new,
        featured: false,
        createdAt: now,
        updatedAt: now,
        _order: seed.order,
        _hasBackdrop: Boolean(details?.backdrop_path ?? seed.backdropPath),
        _priority:
          Number(seed.flags.featured) + Number(seed.flags.trending) + Number(seed.flags.popular)
      };
    });

    const featuredIdx = payloads.findIndex(
      (p) => p._hasBackdrop && (p._priority > 0 || p._order === 0)
    );

    const items = payloads.map(({ _order, _hasBackdrop, _priority, ...item }, i) => ({
      ...item,
      featured: i === featuredIdx
    }));

    let synced = 0;
    for (let i = 0; i < items.length; i += 50) {
      synced += await ctx.runMutation(internal.content.upsertBatchFromTMDB, {
        items: items.slice(i, i + 50)
      });
    }
    return synced;
  }
});

export const syncSeasons = action({
  args: { tmdbId: v.string(), contentId: v.string(), totalSeasons: v.number() },
  handler: async (ctx, { tmdbId, contentId, totalSeasons }) => {
    const content = await ctx.runQuery(api.content.getContentSyncContextById, {
      id: contentId as any
    });
    const contentTitle = content?.title;
    const override = getTvOrderingOverride(tmdbId);

    if (override?.episodeGroupId) {
      const groupData = await tmdbGet<{
        groups: Array<{
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
        }>;
      }>(`/tv/episode_group/${override.episodeGroupId}`);

      if (groupData?.groups?.length) {
        let groupSynced = 0;
        for (const group of groupData.groups.slice(0, override.canonicalSeasonCount)) {
          const seasonNum = Math.max(1, group.order);
          const resolvedAniListId = await resolveAniListId({
            title: contentTitle,
            season: seasonNum,
            seasonTitle: group.name,
            year: getYear(group.episodes[0]?.air_date ?? undefined)
          });
          const episodes = group.episodes.map((ep, i) => ({
            episodeNumber: i + 1,
            name: ep.name,
            overview: ep.overview || undefined,
            stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
            airDate: ep.air_date ?? undefined,
            runtime: ep.runtime ?? undefined,
            voteAverage: ep.vote_average
          }));
          const anilistEpisodeMappings = await buildAniListEpisodeMappings({
            anilistId: resolvedAniListId,
            title: contentTitle,
            season: seasonNum,
            seasonTitle: group.name,
            year: getYear(group.episodes[0]?.air_date ?? undefined),
            episodes
          });
          await ctx.runMutation(internal.seasons.upsertSeason, {
            contentId: contentId as any,
            tmdbId,
            anilistId: resolvedAniListId ?? undefined,
            anilistEpisodeMappings,
            seasonNumber: seasonNum,
            name: group.name,
            overview: undefined,
            posterUrl: undefined,
            airDate: group.episodes[0]?.air_date ?? undefined,
            episodeCount: group.episodes.length,
            episodes: compactSeasonEpisodesForDb(episodes)
          });
          groupSynced++;
        }
        return groupSynced;
      }
    }

    let synced = 0;
    for (let s = 1; s <= Math.min(totalSeasons, 20); s++) {
      const payload = await buildCanonicalSeasonPayload(tmdbId, s, override);
      if (!payload) continue;
      const resolvedAniListId = await resolveAniListId({
        title: contentTitle,
        season: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year
      });
      const anilistEpisodeMappings = await buildAniListEpisodeMappings({
        anilistId: resolvedAniListId,
        title: contentTitle,
        season: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year,
        episodes: payload.episodes
      });
      await ctx.runMutation(internal.seasons.upsertSeason, {
        contentId: contentId as any,
        tmdbId,
        anilistId: resolvedAniListId ?? undefined,
        anilistEpisodeMappings,
        seasonNumber: payload.seasonNumber,
        name: payload.name,
        overview: payload.overview,
        posterUrl: payload.posterUrl,
        airDate: payload.airDate,
        episodeCount: payload.episodeCount,
        episodes: compactSeasonEpisodesForDb(payload.episodes)
      });
      synced++;
    }
    return synced;
  }
});

export const syncSeason = action({
  args: { tmdbId: v.string(), contentId: v.string(), seasonNumber: v.number() },
  handler: async (ctx, { tmdbId, contentId, seasonNumber }) => {
    const content = await ctx.runQuery(api.content.getContentSyncContextById, {
      id: contentId as any
    });
    const contentTitle = content?.title;
    const override = getTvOrderingOverride(tmdbId);

    if (override?.episodeGroupId) {
      const groupData = await tmdbGet<{
        groups: Array<{
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
        }>;
      }>(`/tv/episode_group/${override.episodeGroupId}`);

      const group = groupData?.groups?.find((g) => Math.max(1, g.order) === seasonNumber);
      if (!group) return null;

      const resolvedAniListId = await resolveAniListId({
        title: contentTitle,
        season: seasonNumber,
        seasonTitle: group.name,
        year: getYear(group.episodes[0]?.air_date ?? undefined)
      });
      const episodes = group.episodes.map((ep, i) => ({
        episodeNumber: i + 1,
        name: ep.name,
        overview: ep.overview || undefined,
        stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
        airDate: ep.air_date ?? undefined,
        runtime: ep.runtime ?? undefined,
        voteAverage: ep.vote_average
      }));
      const anilistEpisodeMappings = await buildAniListEpisodeMappings({
        anilistId: resolvedAniListId,
        title: contentTitle,
        season: seasonNumber,
        seasonTitle: group.name,
        year: getYear(group.episodes[0]?.air_date ?? undefined),
        episodes
      });
      await ctx.runMutation(internal.seasons.upsertSeason, {
        contentId: contentId as any,
        tmdbId,
        anilistId: resolvedAniListId ?? undefined,
        anilistEpisodeMappings,
        seasonNumber,
        name: group.name,
        overview: undefined,
        posterUrl: undefined,
        airDate: group.episodes[0]?.air_date ?? undefined,
        episodeCount: group.episodes.length,
        episodes: compactSeasonEpisodesForDb(episodes)
      });
      return { seasonNumber, episodeCount: group.episodes.length };
    }

    const payload = await buildCanonicalSeasonPayload(tmdbId, seasonNumber, override);
    if (!payload) return null;

    const resolvedAniListId = await resolveAniListId({
      title: contentTitle,
      season: payload.seasonNumber,
      seasonTitle: payload.name,
      year: payload.year
    });
    const anilistEpisodeMappings = await buildAniListEpisodeMappings({
      anilistId: resolvedAniListId,
      title: contentTitle,
      season: payload.seasonNumber,
      seasonTitle: payload.name,
      year: payload.year,
      episodes: payload.episodes
    });
    await ctx.runMutation(internal.seasons.upsertSeason, {
      contentId: contentId as any,
      tmdbId,
      anilistId: resolvedAniListId ?? undefined,
      anilistEpisodeMappings,
      seasonNumber: payload.seasonNumber,
      name: payload.name,
      overview: payload.overview,
      posterUrl: payload.posterUrl,
      airDate: payload.airDate,
      episodeCount: payload.episodeCount,
      episodes: compactSeasonEpisodesForDb(payload.episodes)
    });
    return { seasonNumber: payload.seasonNumber, episodeCount: payload.episodeCount };
  }
});

export const getCredits = action({
  args: { tmdbId: v.number(), type: v.union(v.literal("movie"), v.literal("tv")) },
  handler: async (_ctx, { tmdbId, type }) => {
    const endpoint = type === "movie" ? `/movie/${tmdbId}/credits` : `/tv/${tmdbId}/credits`;
    const data = await tmdbGet<{
      cast: Array<{
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order: number;
      }>;
      crew: Array<{ id: number; name: string; job: string; department: string }>;
    }>(endpoint);

    if (!data) return null;
    return {
      cast: data.cast.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profileUrl: getProfileUrl(c.profile_path),
        order: c.order
      })),
      directors: data.crew.filter((c) => c.job === "Director").map((c) => c.name)
    };
  }
});

export const getVideos = action({
  args: { tmdbId: v.number(), type: v.union(v.literal("movie"), v.literal("tv")) },
  handler: async (_ctx, { tmdbId, type }) => {
    const endpoint = type === "movie" ? `/movie/${tmdbId}/videos` : `/tv/${tmdbId}/videos`;
    const data = await tmdbGet<{ results: TMDBVideo[] }>(endpoint);
    if (!data?.results) return [];
    return data.results
      .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
      .map((v) => ({ key: v.key, name: v.name, type: v.type, official: v.official }));
  }
});

export const getRelated = action({
  args: {
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    limit: v.optional(v.number())
  },
  handler: async (_ctx, { tmdbId, type, limit = 10 }) => {
    const endpoint =
      type === "movie" ? `/movie/${tmdbId}/recommendations` : `/tv/${tmdbId}/recommendations`;
    const data = await tmdbGet<{ results: TMDBListItem[] }>(endpoint);
    if (!data?.results) return [];
    return data.results.slice(0, limit).map((item) => {
      const isMovie = "title" in item;
      return {
        tmdbId: item.id,
        title: isMovie ? item.title : item.name,
        type: isMovie ? "movie" : "tv",
        posterUrl: getPosterUrl(item.poster_path),
        year: getYear(isMovie ? item.release_date : item.first_air_date),
        voteAverage: item.vote_average
      };
    });
  }
});

export const syncSingleContent = action({
  args: {
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv"))
  },
  handler: async (
    ctx,
    { tmdbId, type }
  ): Promise<{
    alreadyExists: boolean;
    contentId: string | undefined;
    tmdbId: string;
    seasons: number | undefined;
    totalEpisodes: number | undefined;
  } | null> => {
    const details = await tmdbGet<TMDBMovieDetails | TMDBTVDetails>(
      type === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`,
      { append_to_response: "external_ids,videos,images" }
    );
    if (!details) return null;

    const existing = await ctx.runQuery(internal.content.getSyncMetadataByTmdbId, {
      tmdbId: String(tmdbId)
    });

    const md = details as TMDBMovieDetails | null;
    const td = details as TMDBTVDetails | null;
    const genres = getGenres(details);
    const animeLike = isAnimeLikeContent({
      type,
      genres,
      originalLanguage: details.original_language
    });
    const resolvedAniListId = animeLike
      ? await resolveAniListId({
          title: type === "movie" ? md?.title : td?.name,
          season: 1,
          year: getYear(type === "movie" ? md?.release_date : td?.first_air_date)
        })
      : null;

    const now = Date.now();
    const item = {
      title: (type === "movie" ? md?.title : td?.name) || "Unknown Title",
      description: details.overview || "No description available",
      type,
      genre: genres,
      year: getYear(type === "movie" ? md?.release_date : td?.first_air_date),
      rating: getRating(details.vote_average),
      voteAverage: details.vote_average,
      voteCount: details.vote_count,
      popularity: details.popularity,
      posterUrl: getPosterUrl(details.poster_path),
      backdropUrl: getBackdropUrl(details.backdrop_path),
      logoUrl: getLogoUrl(type === "movie" ? md?.images?.logos : td?.images?.logos),
      trailerKey: getTrailerKey(type === "movie" ? md?.videos?.results : td?.videos?.results),
      tmdbId: String(tmdbId),
      anilistId: resolvedAniListId ?? undefined,
      imdbId:
        (type === "movie" ? md?.imdb_id || md?.external_ids?.imdb_id : td?.external_ids?.imdb_id) ||
        undefined,
      duration:
        type === "movie" ? formatRuntime(md?.runtime) : formatRuntime(td?.episode_run_time?.[0]),
      seasons: type === "tv" ? getCanonicalSeasonCount(tmdbId, td?.number_of_seasons) : undefined,
      totalEpisodes:
        type === "tv" ? getCanonicalTotalEpisodes(tmdbId, td?.number_of_episodes) : undefined,
      status: type === "movie" ? md?.status : td?.status,
      tagline: details.tagline || undefined,
      originalLanguage: details.original_language,
      trending: existing ? existing.trending : false,
      popular: existing ? existing.popular : false,
      featured: existing ? existing.featured : false,
      new: existing ? existing.new : false,
      createdAt: now,
      updatedAt: now
    };

    await ctx.runMutation(internal.content.upsertBatchFromTMDB, { items: [item] });
    const synced = await ctx.runQuery(internal.content.getSyncMetadataByTmdbId, {
      tmdbId: String(tmdbId)
    });

    return {
      alreadyExists: !!existing,
      contentId: synced?._id,
      tmdbId: String(tmdbId),
      seasons: item.seasons,
      totalEpisodes: item.totalEpisodes
    };
  }
});
