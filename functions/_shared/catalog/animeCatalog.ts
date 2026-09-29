type AnimeMedia = "all" | "movie" | "tv";
type AnimeSort = "popular" | "newest" | "oldest" | "top-rated";
type MediaType = "movie" | "tv";

export interface AnimeCatalogItem {
  tmdbId: string;
  title: string;
  type: MediaType;
  year: number;
  releaseDate?: string;
  posterUrl: string;
  voteAverage?: number;
  popularity?: number;
  genre: string[];
}

export interface AnimeCatalogResult {
  items: AnimeCatalogItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

interface AniListTitle {
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
}

interface AniListMedia {
  id?: number;
  format?: string | null;
  title?: AniListTitle | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[] | null;
}

interface AniListResponse {
  data?: {
    Page?: {
      pageInfo?: { lastPage?: number | null; total?: number | null } | null;
      media?: AniListMedia[] | null;
    } | null;
  };
}

interface AnimeFilter {
  genre?: string;
  tag?: string;
}

interface TmdbSearchItem {
  id?: number;
  poster_path?: string | null;
}

interface TmdbSearchResponse {
  results?: TmdbSearchItem[];
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const TMDB_ENDPOINT = "https://api.themoviedb.org/3";

const ANIME_FILTERS: Record<string, AnimeFilter> = {
  action: { genre: "Action" },
  adventure: { genre: "Adventure" },
  comedy: { genre: "Comedy" },
  drama: { genre: "Drama" },
  fantasy: { genre: "Fantasy" },
  historical: { tag: "Historical" },
  horror: { genre: "Horror" },
  isekai: { tag: "Isekai" },
  mecha: { genre: "Mecha" },
  music: { genre: "Music" },
  mystery: { genre: "Mystery" },
  psychological: { genre: "Psychological" },
  romance: { genre: "Romance" },
  school: { tag: "School" },
  "sci-fi": { genre: "Sci-Fi" },
  "slice-of-life": { genre: "Slice of Life" },
  sports: { genre: "Sports" },
  supernatural: { genre: "Supernatural" },
  thriller: { genre: "Thriller" }
};

const ANILIST_QUERY = `
  query ($page: Int!, $genre: String, $tag: String, $format: MediaFormat, $sort: [MediaSort!]!) {
    Page(page: $page, perPage: 50) {
      pageInfo { lastPage total }
      media(type: ANIME, genre: $genre, tag: $tag, format: $format, sort: $sort, isAdult: false) {
        id format
        title { english romaji native }
        startDate { year month day }
        averageScore popularity genres
      }
    }
  }
`;

function parseMedia(value: string | null): AnimeMedia {
  return value === "movie" || value === "tv" ? value : "all";
}

function parseSort(value: string | null): AnimeSort {
  return value === "newest" || value === "oldest" || value === "top-rated" ? value : "popular";
}

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 500) : 1;
}

function parseFilter(value: string | null) {
  return value && ANIME_FILTERS[value] ? ANIME_FILTERS[value] : {};
}

function parseSortKey(sort: AnimeSort) {
  if (sort === "newest") return "START_DATE_DESC";
  if (sort === "oldest") return "START_DATE";
  if (sort === "top-rated") return "SCORE_DESC";
  return "POPULARITY_DESC";
}

function titleFor(media: AniListMedia) {
  return media.title?.english || media.title?.romaji || media.title?.native || null;
}

function releaseDateFor(media: AniListMedia) {
  const date = media.startDate;
  if (!date?.year) return undefined;
  return [date.year, date.month, date.day]
    .filter((value): value is number => typeof value === "number")
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, "0")))
    .join("-");
}

function mediaTypeFor(format: string | null | undefined): MediaType {
  return format === "MOVIE" ? "movie" : "tv";
}

async function readJson(response: Response, name: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${name} failed (${response.status})`);
  return response.json();
}

async function fetchAniList(
  page: number,
  filter: AnimeFilter,
  format: "MOVIE" | undefined,
  sort: AnimeSort,
  fetcher: Fetcher
) {
  const response = await fetcher(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: { page, ...filter, format, sort: [parseSortKey(sort)] }
    })
  });
  const value = (await readJson(response, "AniList Anime catalog")) as AniListResponse;
  const pageData = value.data?.Page;
  if (!pageData) throw new Error("AniList returned no Anime page");
  return pageData;
}

async function findTmdbMatch(
  media: AniListMedia,
  apiKey: string,
  fetcher: Fetcher
): Promise<{ tmdbId: string; posterUrl: string; type: MediaType } | null> {
  const title = titleFor(media);
  if (!title) return null;
  const type = mediaTypeFor(media.format);
  const params = new URLSearchParams({
    api_key: apiKey,
    language: "en-US",
    query: title,
    page: "1",
    include_adult: "false"
  });
  const year = media.startDate?.year;
  if (year) params.set(type === "movie" ? "year" : "first_air_date_year", String(year));
  const response = await fetcher(`${TMDB_ENDPOINT}/search/${type}?${params}`, {
    headers: { Accept: "application/json" }
  });
  const value = (await readJson(response, "TMDB Anime enrichment")) as TmdbSearchResponse;
  const match = value.results?.find((item) => item.id && item.poster_path);
  return match?.id && match.poster_path
    ? {
        tmdbId: String(match.id),
        posterUrl: `https://image.tmdb.org/t/p/w500${match.poster_path}`,
        type
      }
    : null;
}

export async function fetchAnimeCatalog(
  requestUrl: string,
  tmdbApiKey: string,
  fetcher: Fetcher = fetch
): Promise<AnimeCatalogResult> {
  const request = new URL(requestUrl);
  const media = parseMedia(request.searchParams.get("media"));
  const sort = parseSort(request.searchParams.get("sort"));
  const filter = parseFilter(request.searchParams.get("genre"));
  const page = parsePage(request.searchParams.get("page"));
  const sourcePage = await fetchAniList(
    page,
    filter,
    media === "movie" ? "MOVIE" : undefined,
    sort,
    fetcher
  );
  const sourceItems = (sourcePage.media ?? []).filter(
    (item) =>
      ["MOVIE", "TV", "ONA", "TV_SHORT"].includes(item.format ?? "") &&
      (media !== "tv" || mediaTypeFor(item.format) === "tv")
  );
  const enriched: Array<AnimeCatalogItem | null> = await Promise.all(
    sourceItems.map(async (source) => {
      const match = await findTmdbMatch(source, tmdbApiKey, fetcher);
      const title = titleFor(source);
      if (!match || !title) return null;
      const releaseDate = releaseDateFor(source);
      return {
        tmdbId: match.tmdbId,
        title,
        type: match.type,
        year: source.startDate?.year ?? 0,
        releaseDate,
        posterUrl: match.posterUrl,
        voteAverage: source.averageScore == null ? undefined : source.averageScore / 10,
        popularity: source.popularity ?? undefined,
        genre: source.genres ?? []
      } satisfies AnimeCatalogItem;
    })
  );
  const seen = new Set<string>();
  const items = enriched.filter((item): item is AnimeCatalogItem => {
    if (!item) return false;
    const key = `${item.type}:${item.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    items,
    page,
    totalPages: sourcePage.pageInfo?.lastPage ?? 1,
    totalResults: sourcePage.pageInfo?.total ?? items.length
  };
}
