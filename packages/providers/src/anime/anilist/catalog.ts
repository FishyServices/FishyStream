import { HttpError, type Fetcher } from "../../shared/http.js";
import type { MediaType } from "../../shared/media.js";
import { searchTmdbTitle } from "../tmdbTitleSearch.js";
import { queryAniList } from "./request.js";
import type { AniListMedia } from "./types.js";

export type AnimeMediaFilter = "all" | MediaType;
export type AnimeSort = "popular" | "newest" | "oldest" | "top-rated";

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

interface AnimeFilter {
  genre?: string;
  tag?: string;
}

interface CatalogMedia extends AniListMedia {
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[] | null;
}

interface CatalogPage {
  Page?: {
    pageInfo?: { lastPage?: number | null; total?: number | null } | null;
    media?: CatalogMedia[] | null;
  } | null;
}

interface TmdbMatch {
  tmdbId: string;
  posterUrl: string;
  type: MediaType;
}

const MAX_PAGE = 50;
const CATALOG_PAGE_SIZE = 24;
const TMDB_MATCH_CONCURRENCY = 4;
const ANILIST_SOURCE_PAGES_PER_CATALOG_PAGE = 2;
const CATALOG_FORMATS: ReadonlySet<string> = new Set(["MOVIE", "TV", "ONA", "TV_SHORT"]);
const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";

const ANIME_FILTERS: Readonly<Record<string, AnimeFilter>> = {
  action: { genre: "Action" },
  adventure: { genre: "Adventure" },
  comedy: { genre: "Comedy" },
  drama: { genre: "Drama" },
  ecchi: { genre: "Ecchi" },
  fantasy: { genre: "Fantasy" },
  hentai: { genre: "Hentai" },
  historical: { tag: "Historical" },
  horror: { genre: "Horror" },
  isekai: { tag: "Isekai" },
  "mahou-shoujo": { genre: "Mahou Shoujo" },
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

const SORT_KEYS: Readonly<Record<AnimeSort, string>> = {
  popular: "POPULARITY_DESC",
  newest: "START_DATE_DESC",
  oldest: "START_DATE",
  "top-rated": "SCORE_DESC"
};

const CATALOG_QUERY = `query ($page: Int!, $genre: String, $tag: String, $format: MediaFormat, $sort: [MediaSort!]!, $isAdult: Boolean!) { Page(page: $page, perPage: 50) { pageInfo { lastPage total } media(type: ANIME, genre: $genre, tag: $tag, format: $format, sort: $sort, isAdult: $isAdult) { id format title { english romaji native } startDate { year month day } averageScore popularity genres } } }`;

function parseMedia(value: string | null): AnimeMediaFilter {
  return value === "movie" || value === "tv" ? value : "all";
}

function parseSort(value: string | null): AnimeSort {
  return value === "newest" || value === "oldest" || value === "top-rated" ? value : "popular";
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1;
}

function parseFilter(value: string | null): AnimeFilter {
  return (value && ANIME_FILTERS[value]) || {};
}

function mediaTypeOf(media: AniListMedia): MediaType {
  return media.format === "MOVIE" ? "movie" : "tv";
}

function titleOf(media: AniListMedia): string | null {
  return media.title?.english || media.title?.romaji || media.title?.native || null;
}

function releaseDateOf(media: AniListMedia): string | undefined {
  const { year, month, day } = media.startDate ?? {};
  if (!year) return undefined;
  return [String(year), month, day]
    .filter((part): part is string | number => part !== null && part !== undefined)
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

async function findTmdbMatch(
  media: AniListMedia,
  apiKey: string,
  fetcher?: Fetcher
): Promise<TmdbMatch | null> {
  const title = titleOf(media);
  if (!title) return null;
  const type = mediaTypeOf(media);
  const year = media.startDate?.year;
  const search = async (includeYear: boolean) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await searchTmdbTitle(
          type,
          title,
          includeYear ? (year ?? 0) : 0,
          false,
          apiKey,
          fetcher
        );
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 429 || attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  };
  let response = await search(true);
  let match = response.results?.find((item) => item.id && item.poster_path);
  if (!match && year) {
    response = await search(false);
    match = response.results?.find((item) => item.id && item.poster_path);
  }
  if (!match?.id || !match.poster_path) return null;
  return { tmdbId: String(match.id), posterUrl: `${POSTER_BASE_URL}${match.poster_path}`, type };
}

export async function fetchAnimeCatalog(
  requestUrl: string,
  tmdbApiKey: string,
  fetcher?: Fetcher
): Promise<AnimeCatalogResult> {
  const params = new URL(requestUrl).searchParams;
  const media = parseMedia(params.get("media"));
  const sort = parseSort(params.get("sort"));
  const page = parsePage(params.get("page"));
  const isAdult = params.get("adult") === "1";

  const sourcePageNumbers = [
    (page - 1) * ANILIST_SOURCE_PAGES_PER_CATALOG_PAGE + 1,
    (page - 1) * ANILIST_SOURCE_PAGES_PER_CATALOG_PAGE + 2
  ];
  const sourcePages: NonNullable<CatalogPage["Page"]>[] = [];
  for (const sourcePageNumber of sourcePageNumbers) {
    const data = await queryAniList<CatalogPage>(
      CATALOG_QUERY,
      {
        page: sourcePageNumber,
        ...parseFilter(params.get("genre")),
        format: media === "movie" ? "MOVIE" : undefined,
        isAdult,
        sort: [SORT_KEYS[sort]]
      },
      fetcher
    );
    if (!data.Page) throw new Error("AniList returned no Anime page");
    sourcePages.push(data.Page);
    if (sourcePageNumber >= (data.Page.pageInfo?.lastPage ?? sourcePageNumber)) break;
  }
  const sourcePage = sourcePages[0];
  if (!sourcePage) throw new Error("AniList returned no Anime page");

  const sources = sourcePages
    .flatMap((result) => result.media ?? [])
    .filter(
      (item) =>
        CATALOG_FORMATS.has(item.format ?? "") && (media !== "tv" || mediaTypeOf(item) === "tv")
    );
  const matched: Array<AnimeCatalogItem | null> = [];
  for (let index = 0; index < sources.length; index += TMDB_MATCH_CONCURRENCY) {
    const batch = sources.slice(index, index + TMDB_MATCH_CONCURRENCY);
    matched.push(
      ...(await Promise.all(
        batch.map(async (source): Promise<AnimeCatalogItem | null> => {
          const title = titleOf(source);
          if (!title) return null;
          const match = await findTmdbMatch(source, tmdbApiKey, fetcher).catch(() => null);
          if (!match) return null;
          return {
            tmdbId: match.tmdbId,
            title,
            type: match.type,
            year: source.startDate?.year ?? 0,
            releaseDate: releaseDateOf(source),
            posterUrl: match.posterUrl,
            voteAverage: source.averageScore == null ? undefined : source.averageScore / 10,
            popularity: source.popularity ?? undefined,
            genre: source.genres ?? []
          };
        })
      ))
    );
  }

  const seen = new Set<string>();
  const items = matched.filter((item): item is AnimeCatalogItem => {
    if (!item) return false;
    const key = `${item.type}:${item.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    items: items.slice(0, CATALOG_PAGE_SIZE),
    page,
    totalPages: Math.ceil(
      Math.min(
        sourcePage.pageInfo?.lastPage ?? 1,
        MAX_PAGE * ANILIST_SOURCE_PAGES_PER_CATALOG_PAGE
      ) / ANILIST_SOURCE_PAGES_PER_CATALOG_PAGE
    ),
    totalResults: sourcePage.pageInfo?.total ?? items.length
  };
}
