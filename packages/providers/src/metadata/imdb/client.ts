import { recover } from "../../shared/async.js";
import type { MediaType } from "../../shared/media.js";
import { formatDuration } from "../helpers.js";
import type {
  Episode,
  EpisodePage,
  MetadataClient,
  Rating,
  Title,
  TitleReference
} from "../types.js";
import {
  hasId,
  nodeAgeRating,
  nodeGenres,
  nodePoster,
  nodeRating,
  nodeTitle,
  nodeYear,
  toContentCard,
  toItem,
  toTitle
} from "./mappers.js";
import { executeIMDbQuery, executeIMDbQueryOrDefault } from "./request.js";
import { IMDB_PAGE_SIZE, imdbQueries } from "./queries.js";
import type {
  IMDbBrowseResponse,
  IMDbCreditsResponse,
  IMDbEpisodesResponse,
  IMDbRelatedResponse,
  IMDbSearchResponse,
  IMDbTitleNode,
  IMDbTitleResponse,
  IMDbVideosResponse
} from "./schema.js";
import type {
  IMDbClient,
  IMDbContentCard,
  IMDbCreditResult,
  IMDbDetailsResult,
  IMDbDiscoverOptions,
  IMDbDiscoverResult,
  IMDbFullDetail,
  IMDbItem,
  IMDbRequest,
  IMDbSeasonDetail,
  IMDbVideoResult
} from "./types.js";

const MAX_CAST_MEMBERS = 20;
const TRAILER_LABELS: ReadonlySet<string> = new Set(["Trailer", "Teaser"]);

function toDetails(detail: IMDbFullDetail): IMDbDetailsResult {
  return {
    description: detail.description,
    backdropUrl: detail.backdropUrl,
    rating: detail.rating,
    duration: detail.duration,
    seasons: detail.seasons,
    hasSpecials: detail.hasSpecials,
    tagline: detail.tagline,
    originalLanguage: detail.originalLanguage
  };
}

function toCard(detail: IMDbFullDetail): IMDbContentCard {
  return {
    imdbId: detail.imdbId,
    type: detail.type,
    title: detail.title,
    year: detail.year,
    posterUrl: detail.posterUrl,
    voteAverage: detail.voteAverage,
    genre: detail.genre,
    isNew: false
  };
}

export function createIMDbClient(request: IMDbRequest): IMDbClient {
  const run = <T>(query: string, signal?: AbortSignal) =>
    executeIMDbQuery<T>(request, query, signal);
  const runOrDefault = <T>(query: string, fallback: T, signal?: AbortSignal) =>
    executeIMDbQueryOrDefault<T>(request, query, fallback, signal);

  async function getTitle(reference: TitleReference, signal?: AbortSignal): Promise<Title | null> {
    const data = await run<IMDbTitleResponse>(imdbQueries.title(reference.id), signal);
    const title = toTitle(data.title);
    return title ? { ...title, type: reference.type } : null;
  }

  async function getTitleRating(
    reference: TitleReference,
    signal?: AbortSignal
  ): Promise<Rating | null> {
    const data = await run<IMDbTitleResponse>(imdbQueries.rating(reference.id), signal);
    return nodeRating(data.title) ?? null;
  }

  async function getEpisodePage(
    reference: TitleReference,
    signal?: AbortSignal
  ): Promise<EpisodePage> {
    const data = await run<IMDbEpisodesResponse>(
      imdbQueries.episodes(reference.id, reference.cursor),
      signal
    );
    const page = data.title?.episodes?.episodes;
    const episodes = (page?.edges ?? []).flatMap((edge): Episode[] => {
      const title = toTitle(edge.node);
      return title ? [{ ...title, type: reference.type }] : [];
    });
    return {
      episodes,
      nextCursor: page?.pageInfo?.hasNextPage ? (page.pageInfo.endCursor ?? undefined) : undefined
    };
  }

  async function search(query: string, type: MediaType, signal?: AbortSignal): Promise<IMDbItem[]> {
    const response = await runOrDefault<IMDbSearchResponse>(
      imdbQueries.search(query, type),
      {},
      signal
    );
    return (response.mainSearch?.edges ?? []).flatMap((edge) => {
      const node = edge.node?.entity;
      return hasId(node) ? [toItem(node, type)] : [];
    });
  }

  async function searchAll(query: string, signal?: AbortSignal) {
    const [movies, shows] = await Promise.all([
      search(query, "movie", signal),
      search(query, "tv", signal)
    ]);
    return { movies, shows };
  }

  async function discover(
    type: MediaType,
    options: IMDbDiscoverOptions = {}
  ): Promise<IMDbDiscoverResult> {
    const { sortBy, genres = [], signal } = options;
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const byRating = sortBy === "rating";
    let cursor: string | undefined;
    let response: IMDbBrowseResponse = {};
    for (let current = 1; current <= page; current += 1) {
      response = await runOrDefault<IMDbBrowseResponse>(
        imdbQueries.browse({ type, cursor, genres, byRating }),
        {},
        signal
      );
      if (current === page) break;
      const info = response.advancedTitleSearch?.pageInfo;
      if (!info?.hasNextPage || !info.endCursor) {
        response = { advancedTitleSearch: { total: response.advancedTitleSearch?.total } };
        break;
      }
      cursor = info.endCursor;
    }
    const result = response.advancedTitleSearch;
    const total = result?.total ?? 0;
    return {
      items: (result?.edges ?? []).flatMap((edge) => toContentCard(edge.node?.title, type) ?? []),
      totalPages: Math.max(1, Math.ceil(total / IMDB_PAGE_SIZE)),
      totalResults: total
    };
  }

  async function fullDetail(
    id: string,
    type: MediaType,
    signal?: AbortSignal
  ): Promise<IMDbFullDetail | null> {
    const node = await recover(
      async () => (await run<IMDbTitleResponse>(imdbQueries.detail(id), signal)).title ?? null,
      null
    );
    const title = nodeTitle(node);
    if (!node || !title) return null;
    const isTv = type === "tv";
    const seasons = node.episodes?.seasons;
    return {
      imdbId: id,
      type,
      title,
      description: node.plot?.plotText?.plainText ?? "No description available",
      year: nodeYear(node),
      rating: nodeAgeRating(node),
      voteAverage: node.ratingsSummary?.aggregateRating ?? undefined,
      posterUrl: nodePoster(node),
      backdropUrl: nodePoster(node),
      duration: isTv ? undefined : formatDuration(Math.floor((node.runtime?.seconds ?? 0) / 60)),
      seasons: isTv ? seasons?.length : undefined,
      totalEpisodes: isTv ? (node.episodes?.episodes?.total ?? undefined) : undefined,
      hasSpecials: isTv ? seasons?.some((season) => season.number === 0) : undefined,
      genre: nodeGenres(node),
      originalLanguage: node.spokenLanguages?.spokenLanguages?.[0]?.text ?? undefined,
      tagline: node.taglines?.edges?.[0]?.node?.text || undefined,
      status: node.productionStatus?.currentProductionStage?.text || undefined,
      trending: false,
      isNew: false
    };
  }

  async function related(
    id: string,
    type: MediaType,
    limit = 10,
    signal?: AbortSignal
  ): Promise<IMDbItem[]> {
    const response = await runOrDefault<IMDbRelatedResponse>(
      imdbQueries.related(id, limit),
      {},
      signal
    );
    return (response.title?.moreLikeThisTitles?.edges ?? [])
      .flatMap((edge) => (hasId(edge.node) ? [toItem(edge.node, type)] : []))
      .slice(0, limit);
  }

  async function credits(id: string, signal?: AbortSignal): Promise<IMDbCreditResult | null> {
    const response = await recover(
      () => run<IMDbCreditsResponse>(imdbQueries.credits(id), signal),
      null
    );
    if (!response) return null;
    const groups = response.title?.principalCredits ?? [];
    const creditsOf = (category: string) =>
      groups.find((group) => group.category?.id === category)?.credits ?? [];
    return {
      cast: creditsOf("cast")
        .slice(0, MAX_CAST_MEMBERS)
        .map((credit, order) => ({
          id: credit.name?.id ?? "",
          name: credit.name?.nameText?.text ?? "",
          character: credit.characters?.[0]?.name ?? "",
          profileUrl: credit.name?.primaryImage?.url ?? "",
          order
        })),
      directors: creditsOf("director").flatMap((credit) => credit.name?.nameText?.text ?? [])
    };
  }

  async function videos(id: string, signal?: AbortSignal): Promise<IMDbVideoResult[]> {
    const response = await recover(
      () => run<IMDbVideosResponse>(imdbQueries.videos(id), signal),
      null
    );
    return (response?.title?.videos?.edges ?? []).flatMap((edge) => {
      const node = edge.node;
      const label = node?.contentType?.displayName?.value;
      if (!node?.id || !node.name?.value || !label || !TRAILER_LABELS.has(label)) return [];
      return [
        { key: node.id, name: node.name.value, type: label, official: node.isMature !== true }
      ];
    });
  }

  async function seasonEpisodes(
    id: string,
    seasonNumber: number,
    signal?: AbortSignal
  ): Promise<IMDbSeasonDetail | null> {
    const response = await recover(
      () => run<IMDbEpisodesResponse>(imdbQueries.seasonEpisodes(id), signal),
      null
    );
    if (!response) return null;
    const nodes = (response.title?.episodes?.episodes?.edges ?? []).flatMap((edge) => {
      const node: IMDbTitleNode | null | undefined = edge.node;
      const episodeSeason = node?.series?.episodeNumber?.seasonNumber;
      return node && (episodeSeason == null || episodeSeason === seasonNumber) ? [node] : [];
    });
    return {
      episodes: nodes.map((node) => ({
        episodeNumber: node.series?.episodeNumber?.episodeNumber ?? 0,
        name: nodeTitle(node),
        overview: node.plot?.plotText?.plainText ?? undefined,
        stillUrl: node.primaryImage?.url ?? undefined,
        runtime: node.runtime?.seconds ? Math.round(node.runtime.seconds / 60) : undefined,
        voteAverage: node.ratingsSummary?.aggregateRating ?? 0
      }))
    };
  }

  return {
    getTitle,
    getTitleRating,
    getEpisodePage,
    search,
    searchAll,
    discover,
    fullDetail,
    cardDetail: async (id, type, signal) => {
      const detail = await fullDetail(id, type, signal);
      return detail ? toCard(detail) : null;
    },
    details: async (id, type, signal) => {
      const detail = await fullDetail(id, type, signal);
      return detail ? toDetails(detail) : null;
    },
    related,
    credits,
    videos,
    seasonEpisodes
  };
}
