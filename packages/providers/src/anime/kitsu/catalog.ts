import { buildUrl, requestJson, type Fetcher } from "../../shared/http.js";
import type { MediaType } from "../../shared/media.js";
import { TMDB_BASE_URL } from "../../metadata/tmdb/request.js";
import type { AnimeCatalogItem, AnimeCatalogResult } from "../anilist/catalog.js";
import { createKitsuClient, createKitsuRequest } from "./client.js";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const MATCH_CONCURRENCY = 4;
const KITSU_SOURCE_PAGE_SIZE = 20;
const CATALOG_PAGE_SIZE = 40;

interface TmdbSearchResponse {
  results?: Array<{
    id?: number;
    poster_path?: string | null;
    title?: string;
    original_title?: string;
    name?: string;
    original_name?: string;
  }>;
}

function parseFilters(requestUrl: string) {
  const params = new URL(requestUrl).searchParams;
  const media = params.get("media");
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  return {
    media: media === "movie" || media === "tv" ? media : "all",
    sort: sort === "newest" || sort === "oldest" || sort === "top-rated" ? sort : "popular",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 500) : 1,
    genre: params.get("genre") || undefined,
    adult: params.get("adult") === "1"
  };
}

function mediaTypeOf(subtype: string | null): MediaType {
  return subtype?.toLowerCase() === "movie" ? "movie" : "tv";
}

async function findTmdbMatch(
  titles: string[],
  type: MediaType,
  year: number,
  includeAdult: boolean,
  apiKey: string,
  fetcher?: Fetcher
) {
  const normalizedTitles = new Set(titles.map(normalizeTitle).filter(Boolean));
  for (const title of titles) {
    for (const includeYear of year ? [true, false] : [false]) {
      const response = (await requestJson(
        "TMDB",
        buildUrl(TMDB_BASE_URL, `/search/${type}`, {
          api_key: apiKey,
          language: "en-US",
          query: title,
          page: 1,
          include_adult: includeAdult,
          ...(includeYear && year
            ? { [type === "movie" ? "year" : "first_air_date_year"]: year }
            : {})
        }),
        { fetcher }
      ).catch(() => null)) as TmdbSearchResponse | null;
      const match = response?.results?.find((result) => {
        if (!result.id) return false;
        return [result.title, result.original_title, result.name, result.original_name]
          .filter((value): value is string => typeof value === "string")
          .some((value) => normalizedTitles.has(normalizeTitle(value)));
      });
      if (match) return match;
    }
  };
  return undefined;
}

function normalizeTitle(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export async function fetchKitsuAnimeCatalog(
  requestUrl: string,
  tmdbApiKey: string,
  fetcher?: Fetcher
): Promise<AnimeCatalogResult> {
  const filters = parseFilters(requestUrl);
  const client = createKitsuClient(createKitsuRequest(fetcher));
  const sourceOffsets =
    filters.page === 1
      ? [0, 40]
      : [20 + (filters.page - 1) * CATALOG_PAGE_SIZE, 40 + (filters.page - 1) * CATALOG_PAGE_SIZE];
  const sourcePages = await Promise.all(
    sourceOffsets.map((offset) =>
      client.searchAnime("", {
        limit: KITSU_SOURCE_PAGE_SIZE,
        offset,
        sort:
          filters.sort === "newest"
            ? "-startDate"
            : filters.sort === "oldest"
              ? "startDate"
              : filters.sort === "top-rated"
                ? "-averageRating"
                : "-userCount",
        ...(filters.media === "movie" ? { subtype: "movie" } : {}),
        ...(filters.genre ? { category: filters.genre } : {}),
        ageRating: filters.adult ? "R18" : "G,PG,R"
      })
    )
  );
  const sourcePage = sourcePages[0];
  if (!sourcePage) throw new Error("Kitsu returned no anime page");
  const uniqueSources = new Map(
    sourcePages.flatMap(({ data }) => data.map((anime) => [anime.id, anime] as const))
  );
  const sources = [...uniqueSources.values()].filter(
    (anime) => filters.media !== "tv" || mediaTypeOf(anime.attributes.subtype) === "tv"
  );

  const matched: Array<AnimeCatalogItem | null> = [];
  for (let index = 0; index < sources.length; index += MATCH_CONCURRENCY) {
    const batch = sources.slice(index, index + MATCH_CONCURRENCY);
    matched.push(
      ...(await Promise.all(
        batch.map(async (anime): Promise<AnimeCatalogItem | null> => {
          const attributes = anime.attributes;
          const titles = [
            attributes.titles.en,
            attributes.titles.en_us,
            attributes.canonicalTitle,
            ...Object.values(attributes.titles)
          ].filter((value): value is string => typeof value === "string" && value.length > 0);
          const title = titles[0];
          if (!title) return null;
          const type = mediaTypeOf(attributes.subtype);
          const year = attributes.seasonYear ?? (Number(attributes.startDate?.slice(0, 4)) || 0);
          const match = await findTmdbMatch(titles, type, year, filters.adult, tmdbApiKey, fetcher);
          if (!match?.id) return null;
          const posterUrl =
            attributes.posterImage?.large ||
            attributes.posterImage?.medium ||
            attributes.posterImage?.original ||
            (match.poster_path ? `${POSTER_BASE_URL}${match.poster_path}` : undefined);
          if (!posterUrl) return null;
          return {
            tmdbId: String(match.id),
            title,
            type,
            year,
            releaseDate: attributes.startDate ?? undefined,
            posterUrl,
            voteAverage:
              attributes.averageRating === null ? undefined : Number(attributes.averageRating) / 10,
            popularity: attributes.userCount ?? undefined,
            genre: filters.genre ? [filters.genre] : []
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
  const totalResults = sourcePage.meta?.count ?? items.length;
  return {
    items,
    page: filters.page,
    totalPages: Math.max(1, Math.ceil(Math.max(0, totalResults - KITSU_SOURCE_PAGE_SIZE) / CATALOG_PAGE_SIZE)),
    totalResults
  };
}
