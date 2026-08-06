import type {
  Episode,
  IMDbGraphQLResponse,
  IMDbRequest,
  IMDBBrowseResponse,
  IMDBContentCard,
  IMDBCreditResult,
  IMDBCreditsResponse,
  IMDBDetailResponse,
  IMDBDetailsResult,
  IMDBDiscoverResult,
  IMDBFullDetail,
  IMDBItem,
  IMDBRelatedResponse,
  IMDBSearchResponse,
  IMDBSeasonEpisodesResponse,
  IMDBTitleNode,
  IMDBVideoResult,
  IMDBVideosResponse,
  MediaType,
  MetadataClient,
  Rating,
  Title
} from "./types.js";
import { resolveAniListEpisodeAddress, resolveAniListId } from "../anime/anilistResolver.js";

export const IMDB_GRAPHQL_ENDPOINT = "https://api.graphql.imdb.com/";
export const IMDB_PAGE_SIZE = 20;

const image = (url?: string | null) =>
  url ? url : "https://placehold.co/500x750/1a1a2e/666?text=No+Poster";
const year = (node?: IMDBTitleNode | null) =>
  node?.releaseYear?.year ?? node?.releaseDate?.year ?? new Date().getFullYear();
const mediaTitle = (node?: IMDBTitleNode | null) => node?.titleText?.text ?? "";
const mediaGenres = (node?: IMDBTitleNode | null) =>
  (node?.genres?.genres ?? []).map((genre) => genre.text).filter((text): text is string => !!text);
const ageRating = (node?: IMDBTitleNode | null) =>
  node?.certificate?.rating ||
  (() => {
    const value = node?.ratingsSummary?.aggregateRating ?? 0;
    return value >= 7.5 ? "PG-13" : value >= 5 ? "PG" : "G";
  })();
const durationText = (seconds?: number | null) =>
  seconds ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m` : undefined;
const titleTypeFor = (type: MediaType) => (type === "movie" ? "MOVIE" : "TV_SERIES");
const cursorForPage = (page: number, pageSize: number) =>
  btoa(JSON.stringify({ offset: Math.max(0, page - 1) * pageSize }));

type Node = {
  id?: string;
  titleText?: { text?: string | null } | null;
  ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null } | null;
};
const fields = "id titleText { text } ratingsSummary { aggregateRating voteCount }";
const cardFields =
  "id titleText { text } titleType { text } releaseYear { year } primaryImage { url } ratingsSummary { aggregateRating voteCount } genres { genres { text } }";
const asId = (id?: string): `tt${string}` | null =>
  id?.startsWith("tt") ? (id as `tt${string}`) : null;
const rating = (node?: Node | null): Rating | undefined =>
  node?.ratingsSummary?.aggregateRating == null
    ? undefined
    : {
        value: node.ratingsSummary.aggregateRating,
        voteCount: node.ratingsSummary.voteCount ?? undefined
      };
const title = (node?: Node | null): Title | null => {
  const id = asId(node?.id);
  const text = node?.titleText?.text;
  return id && text ? { id, title: text, rating: rating(node) } : null;
};

export function createIMDbProxyRequest(endpoint: string): IMDbRequest {
  return async (query, signal) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal
    });
    if (!response.ok) throw new Error(`IMDb API request failed (${response.status})`);
    return response.json();
  };
}

export async function executeIMDbQuery<T>(
  request: IMDbRequest,
  query: string,
  signal?: AbortSignal
): Promise<T> {
  const response = (await request(query, signal)) as IMDbGraphQLResponse<T>;
  if (!response.data || response.errors?.length)
    throw new Error(
      response.errors?.map((error) => error.message).join("; ") || "IMDb API request failed"
    );
  return response.data;
}

export async function executeIMDbQueryOrDefault<T>(
  request: IMDbRequest,
  query: string,
  fallback: T,
  signal?: AbortSignal
): Promise<T> {
  try {
    return await executeIMDbQuery<T>(request, query, signal);
  } catch {
    return fallback;
  }
}

export function createIMDbClient(request: IMDbRequest): MetadataClient {
  return {
    async getTitle(reference, signal) {
      const data = await executeIMDbQuery<{ title?: Node | null }>(
        request,
        `query { title(id: "${reference.id}") { ${fields} } }`,
        signal
      );
      const value = title(data.title);
      return value ? { ...value, type: reference.type } : null;
    },
    async getTitleRating(reference, signal) {
      const data = await executeIMDbQuery<{ title?: Node | null }>(
        request,
        `query { title(id: "${reference.id}") { ratingsSummary { aggregateRating voteCount } } }`,
        signal
      );
      return rating(data.title) ?? null;
    },
    async getEpisodePage(reference, signal) {
      const after = reference.cursor ? `, after: "${reference.cursor}"` : "";
      const data = await executeIMDbQuery<{
        title?: {
          episodes?: {
            episodes?: {
              edges?: Array<{ node?: Node | null }>;
              pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null };
            };
          };
        };
      }>(
        request,
        `query { title(id: "${reference.id}") { episodes { episodes(first: 250${after}) { edges { node { ${fields} } } pageInfo { endCursor hasNextPage } } } } }`,
        signal
      );
      const page = data.title?.episodes?.episodes;
      const episodes: Episode[] = (page?.edges ?? [])
        .map((edge) => title(edge.node))
        .filter((value): value is Title => !!value)
        .map((value) => ({ ...value, type: reference.type }));
      return {
        episodes,
        nextCursor: page?.pageInfo?.hasNextPage ? (page.pageInfo.endCursor ?? undefined) : undefined
      };
    }
  };
}

export function toIMDBContentCard(
  node?: IMDBTitleNode | null,
  type?: MediaType
): IMDBContentCard | null {
  const id = asId(node?.id);
  const resolvedType = type ?? (node?.titleType?.text === "TV Series" ? "tv" : "movie");
  const text = mediaTitle(node);
  if (!id || !text || !node?.primaryImage?.url) return null;
  return {
    imdbId: id,
    type: resolvedType,
    title: text,
    year: year(node),
    posterUrl: image(node.primaryImage.url),
    voteAverage: node.ratingsSummary?.aggregateRating ?? undefined,
    genre: mediaGenres(node),
    isNew: false
  };
}

export function collectImdbCards(
  responses: Array<{ nodes: Array<IMDBTitleNode | null | undefined>; type?: MediaType }>,
  options: { excludedIds?: Set<string>; typeFilter?: "all" | MediaType } = {}
): IMDBContentCard[] {
  const seen = new Set<string>();
  return responses.flatMap(({ nodes, type }) =>
    nodes
      .map((node) => toIMDBContentCard(node, type))
      .filter((card): card is IMDBContentCard => !!card)
      .filter((card) => {
        const key = `${card.type}:${card.imdbId}`;
        if (
          seen.has(key) ||
          options.excludedIds?.has(key) ||
          (options.typeFilter && options.typeFilter !== "all" && card.type !== options.typeFilter)
        )
          return false;
        seen.add(key);
        return true;
      })
  );
}

export async function fetchImdbSearch(
  query: string,
  request: IMDbRequest,
  signal?: AbortSignal
): Promise<{ movies: IMDBItem[]; shows: IMDBItem[] }> {
  const escaped = query.replace(/"/g, '\\"');
  const map = (nodes: Array<IMDBTitleNode | null | undefined>, type: MediaType): IMDBItem[] =>
    nodes
      .filter((node): node is IMDBTitleNode => !!node)
      .map((node) => ({
        imdbId: node.id,
        title: mediaTitle(node),
        posterUrl: image(node.primaryImage?.url),
        year: year(node),
        genre: mediaGenres(node),
        rating: ageRating(node),
        voteAverage: node.ratingsSummary?.aggregateRating ?? undefined,
        type
      }));
  const search = (mediaType: MediaType) =>
    executeIMDbQueryOrDefault<IMDBSearchResponse>(
      request,
      `query { mainSearch(first: 20, options: { searchTerm: "${escaped}", type: ${titleTypeFor(mediaType)} }) { edges { node { entity { ... on Title { ${cardFields} } } } } } }`,
      {},
      signal
    );
  const [movies, shows] = await Promise.all([search("movie"), search("tv")]);
  return {
    movies: map(
      (movies.mainSearch?.edges ?? []).map((edge) => edge.node?.entity),
      "movie"
    ),
    shows: map(
      (shows.mainSearch?.edges ?? []).map((edge) => edge.node?.entity),
      "tv"
    )
  };
}

export async function fetchImdbDiscover(
  type: MediaType,
  request: IMDbRequest,
  signal: AbortSignal | undefined,
  options: { page?: number; sortBy?: string; genre?: string; minVoteCount?: number } = {}
): Promise<IMDBDiscoverResult> {
  const page = options.page ?? 1;
  const sortField = options.sortBy === "rating" ? "USER_RATING" : "POPULARITY";
  const sortOrder = options.sortBy === "rating" ? "DESC" : "ASC";
  const genreConstraint = options.genre
    ? `genreConstraint: { allGenreIds: ["${options.genre}"] }`
    : "";
  const query = `query { advancedTitleSearch(first: ${IMDB_PAGE_SIZE}, after: "${cursorForPage(page, IMDB_PAGE_SIZE)}", constraints: { titleTypeConstraint: { anyTitleTypeIds: ["${titleTypeFor(type)}"] } ${genreConstraint} ratingsCountConstraint: { aggregateRatingCountMin: ${options.minVoteCount ?? 25} } }, sortBy: ${sortField}, sortOrder: ${sortOrder}) { total edges { node { title { ${cardFields} } } } } }`;
  const data = await executeIMDbQueryOrDefault<IMDBBrowseResponse>(request, query, {}, signal);
  const nodes = (data.advancedTitleSearch?.edges ?? []).map((edge) => edge.node?.title);
  return {
    items: nodes
      .map((node) => toIMDBContentCard(node, type))
      .filter((item): item is IMDBContentCard => !!item),
    totalPages: Math.max(1, Math.ceil((data.advancedTitleSearch?.total ?? 0) / IMDB_PAGE_SIZE)),
    totalResults: data.advancedTitleSearch?.total ?? 0
  };
}

async function detail(
  id: string,
  request: IMDbRequest,
  signal?: AbortSignal
): Promise<IMDBTitleNode | null> {
  try {
    const data = await executeIMDbQuery<IMDBDetailResponse>(
      request,
      `query { title(id: "${id}") { ${cardFields} plot { plotText { plainText } } runtime { seconds } certificate { rating } taglines { edges { node { text } } } spokenLanguages { spokenLanguages { text } } productionStatus { currentProductionStage { text } } episodes { seasons { number } episodes(first: 1) { total } } } }`,
      signal
    );
    return data.title ?? null;
  } catch {
    return null;
  }
}

export async function fetchImdbFullDetail(
  id: string,
  type: MediaType,
  request: IMDbRequest,
  signal?: AbortSignal
): Promise<IMDBFullDetail | null> {
  const value = await detail(id, request, signal);
  const text = mediaTitle(value);
  if (!value || !text) return null;
  return {
    imdbId: id,
    type,
    title: text,
    description: value.plot?.plotText?.plainText ?? "No description available",
    year: year(value),
    rating: ageRating(value),
    voteAverage: value.ratingsSummary?.aggregateRating ?? undefined,
    posterUrl: image(value.primaryImage?.url),
    backdropUrl: image(value.primaryImage?.url),
    duration: type === "movie" ? durationText(value.runtime?.seconds) : undefined,
    seasons: type === "tv" ? value.episodes?.seasons?.length : undefined,
    totalEpisodes: type === "tv" ? (value.episodes?.episodes?.total ?? undefined) : undefined,
    hasSpecials:
      type === "tv" ? value.episodes?.seasons?.some((season) => season.number === 0) : undefined,
    genre: mediaGenres(value),
    originalLanguage: value.spokenLanguages?.spokenLanguages?.[0]?.text ?? undefined,
    tagline: value.taglines?.edges?.[0]?.node?.text || undefined,
    status: value.productionStatus?.currentProductionStage?.text || undefined,
    trending: false,
    isNew: false
  };
}

export async function fetchImdbCardDetail(
  id: string,
  type: MediaType,
  request: IMDbRequest,
  signal?: AbortSignal
) {
  const value = await fetchImdbFullDetail(id, type, request, signal);
  return value
    ? {
        imdbId: value.imdbId,
        type: value.type,
        title: value.title,
        year: value.year,
        posterUrl: value.posterUrl,
        voteAverage: value.voteAverage,
        genre: value.genre,
        isNew: false
      }
    : null;
}

export async function fetchImdbDetails(
  id: string,
  type: MediaType,
  request: IMDbRequest,
  signal?: AbortSignal
): Promise<IMDBDetailsResult | null> {
  const value = await fetchImdbFullDetail(id, type, request, signal);
  return value
    ? {
        description: value.description,
        backdropUrl: value.backdropUrl,
        rating: value.rating,
        duration: value.duration,
        seasons: value.seasons,
        hasSpecials: value.hasSpecials,
        tagline: value.tagline,
        originalLanguage: value.originalLanguage
      }
    : null;
}

export async function fetchImdbRelated(
  id: string,
  type: MediaType,
  request: IMDbRequest,
  limit = 10,
  signal?: AbortSignal
): Promise<IMDBItem[]> {
  const data = await executeIMDbQueryOrDefault<IMDBRelatedResponse>(
    request,
    `query { title(id: "${id}") { moreLikeThisTitles(first: ${limit}) { edges { node { ${cardFields} } } } } }`,
    {},
    signal
  );
  const nodes = (data.title?.moreLikeThisTitles?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node): node is IMDBTitleNode => !!node);
  return nodes.slice(0, limit).map((node) => ({
    imdbId: node.id,
    title: mediaTitle(node),
    posterUrl: image(node.primaryImage?.url),
    year: year(node),
    genre: mediaGenres(node),
    rating: ageRating(node),
    voteAverage: node.ratingsSummary?.aggregateRating ?? undefined,
    type
  }));
}

export async function fetchImdbCredits(
  id: string,
  request: IMDbRequest,
  signal?: AbortSignal
): Promise<IMDBCreditResult | null> {
  try {
    const data = await executeIMDbQuery<IMDBCreditsResponse>(
      request,
      `query { title(id: "${id}") { principalCredits { category { id } credits { name { id nameText { text } primaryImage { url } } characters { name } } } } }`,
      signal
    );
    const groups = data.title?.principalCredits ?? [];
    const castGroup = groups.find((group) => group.category?.id === "cast");
    const directorGroup = groups.find((group) => group.category?.id === "director");
    return {
      cast: (castGroup?.credits ?? []).slice(0, 20).map((credit, order) => ({
        id: credit.name?.id ?? "",
        name: credit.name?.nameText?.text ?? "",
        character: credit.characters?.[0]?.name ?? "",
        profileUrl: credit.name?.primaryImage?.url ? image(credit.name.primaryImage.url) : "",
        order
      })),
      directors: (directorGroup?.credits ?? [])
        .map((credit) => credit.name?.nameText?.text)
        .filter((name): name is string => !!name)
    };
  } catch {
    return null;
  }
}

export async function fetchImdbVideos(
  id: string,
  request: IMDbRequest,
  signal?: AbortSignal
): Promise<IMDBVideoResult[]> {
  try {
    const data = await executeIMDbQuery<IMDBVideosResponse>(
      request,
      `query { title(id: "${id}") { videos(first: 20) { edges { node { id name { value } contentType { displayName { value } } isMature } } } } }`,
      signal
    );
    const edges = data.title?.videos?.edges ?? [];
    return edges
      .map((edge) => edge.node)
      .filter((node): node is NonNullable<typeof node> => !!node)
      .filter((node) => {
        const label = node.contentType?.displayName?.value;
        return !!node.id && !!node.name?.value && (label === "Trailer" || label === "Teaser");
      })
      .map((node) => ({
        key: node.id!,
        name: node.name!.value!,
        type: node.contentType!.displayName!.value!,
        official: node.isMature !== true
      }));
  } catch {
    return [];
  }
}

export async function fetchImdbSeasonEpisodes(
  id: string,
  seasonNumber: number,
  request: IMDbRequest,
  signal?: AbortSignal
) {
  try {
    const data = await executeIMDbQuery<IMDBSeasonEpisodesResponse>(
      request,
      `query { title(id: "${id}") { episodes { episodes(first: 250, filter: { seasonNumber: ${seasonNumber} }) { edges { node { id titleText { text } plot { plotText { plainText } } primaryImage { url } runtime { seconds } ratingsSummary { aggregateRating voteCount } series { episodeNumber { episodeNumber seasonNumber } } } } } } } }`,
      signal
    );
    const nodes = (data.title?.episodes?.episodes?.edges ?? [])
      .map((edge) => edge.node)
      .filter((node): node is IMDBTitleNode => !!node);
    return {
      overview: undefined as string | undefined,
      episodes: nodes.map((node) => ({
        episodeNumber: node.series?.episodeNumber?.episodeNumber ?? 0,
        name: mediaTitle(node),
        overview: node.plot?.plotText?.plainText,
        stillUrl: node.primaryImage?.url ? image(node.primaryImage.url) : undefined,
        runtime: node.runtime?.seconds ? Math.round(node.runtime.seconds / 60) : undefined,
        voteAverage: node.ratingsSummary?.aggregateRating ?? 0
      }))
    };
  } catch {
    return null;
  }
}

export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  return items
    .map((item, index) => ({ item, score: Math.sin((index + 1) * 999 + seed * 9973) }))
    .sort((left, right) => left.score - right.score)
    .map(({ item }) => item);
}

export async function buildImdbCanonicalSeasonPayload(imdbId: string, seasonNumber: number) {
  const request = createIMDbProxyRequest(IMDB_GRAPHQL_ENDPOINT);
  const season = await fetchImdbSeasonEpisodes(imdbId, seasonNumber, request);
  if (!season) return null;
  return {
    seasonNumber,
    name: `Season ${seasonNumber}`,
    overview: season.overview,
    airDate: undefined,
    episodeCount: season.episodes.length,
    year: new Date().getFullYear(),
    episodes: season.episodes.map((episode) => ({ ...episode, airDate: undefined }))
  };
}

export async function resolveImdbSeasonAniListId(args: {
  title?: string;
  seasonNumber: number;
  seasonTitle?: string;
  year?: number;
}) {
  return resolveAniListId({
    title: args.title,
    season: args.seasonNumber,
    seasonTitle: args.seasonTitle,
    year: args.year
  });
}

export async function buildImdbAniListEpisodeMappings(args: {
  anilistId?: string | null;
  title?: string;
  season: number;
  seasonTitle?: string;
  year?: number;
  episodes: Array<{ episodeNumber: number }>;
}) {
  if (!args.anilistId) return undefined;
  const values = await Promise.all(
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
  const mappings = values.filter(
    (value): value is { episodeNumber: number; anilistId: string; anilistEpisodeNumber: number } =>
      !!value
  );
  return mappings.length ? mappings : undefined;
}
