import { buildUrl, requestJson, type Fetcher } from "../../shared/http.js";
import type { MediaType } from "../../shared/media.js";
import { TMDB_BASE_URL } from "../../metadata/tmdb/request.js";
import { queryAniList } from "../anilist/request.js";
import { createJikanClient } from "./client.js";
import type {
  AnimeCatalogItem,
  AnimeCatalogResult,
  AnimeMediaFilter,
  AnimeSort
} from "../anilist/catalog.js";

const JIKAN_GENRES: Readonly<Record<string, number>> = {
  action: 1,
  adventure: 2,
  avant_garde: 5,
  award_winning: 46,
  boys_love: 28,
  comedy: 4,
  drama: 8,
  ecchi: 9,
  fantasy: 10,
  girls_love: 26,
  gourmet: 47,
  hentai: 12,
  historical: 13,
  horror: 14,
  kids: 15,
  magic: 16,
  martial_arts: 17,
  mecha: 18,
  josei: 43,
  music: 19,
  mystery: 7,
  parody: 20,
  romance: 22,
  samurai: 21,
  school: 23,
  sci_fi: 24,
  shoujo: 25,
  shounen: 27,
  sports: 30,
  super_power: 31,
  slice_of_life: 36,
  supernatural: 37,
  military: 38,
  police: 39,
  psychological: 40,
  suspense: 41,
  seinen: 42,
  vampire: 32,
  yaoi: 33,
  yuri: 34,
  isekai: 62
};
const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const TMDB_MATCH_CONCURRENCY = 4;

interface TmdbSearchResponse {
  results?: Array<{ id?: number; poster_path?: string | null }>;
}

interface AnimeSource {
  malId: number;
  title: string;
  type: MediaType;
  year: number;
  releaseDate?: string;
  score?: number;
  genres: string[];
}

interface AniListEnrichment {
  Page?: {
    media?: Array<{
      idMal?: number | null;
      title?: { english?: string | null; romaji?: string | null } | null;
      startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
      averageScore?: number | null;
      popularity?: number | null;
      genres?: string[] | null;
    }> | null;
  } | null;
}

const ANILIST_ENRICHMENT_QUERY = `query ($malIds: [Int!]!) { Page(perPage: 50) { media(idMal_in: $malIds, type: ANIME) { idMal title { english romaji } startDate { year month day } averageScore popularity genres } } }`;

function parseFilters(requestUrl: string) {
  const params = new URL(requestUrl).searchParams;
  const media = params.get("media");
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  const genre = params
    .get("genre")
    ?.toLowerCase()
    .replace(/[\s-]+/g, "_");
  return {
    media: media === "movie" || media === "tv" ? media : ("all" as const),
    sort: sort === "newest" || sort === "oldest" || sort === "top-rated" ? sort : "popular",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 500) : 1,
    genreId: genre ? JIKAN_GENRES[genre] : undefined,
    adult: params.get("adult") === "1"
  };
}

function yearOf(date: string | null | undefined): number {
  const year = date ? Number(date.slice(0, 4)) : 0;
  return Number.isInteger(year) ? year : 0;
}

export async function fetchJikanAnimeCatalog(
  requestUrl: string,
  tmdbApiKey: string,
  fetcher?: Fetcher
): Promise<AnimeCatalogResult> {
  const filters = parseFilters(requestUrl);
  const client = createJikanClient(async (path, query = {}, signal) =>
    requestJson("Jikan", buildUrl("https://api.jikan.moe/v4", path, query), { fetcher, signal })
  );
  const sourcePage = await client.searchAnime("", {
    page: filters.page,
    limit: 25,
    sfw: !filters.adult,
    ...(filters.adult ? { rating: "rx" } : {}),
    ...(filters.media !== "all" ? { type: filters.media } : {}),
    ...(filters.genreId ? { genres: String(filters.genreId) } : {}),
    orderBy:
      filters.sort === "newest" || filters.sort === "oldest"
        ? "start_date"
        : filters.sort === "top-rated"
          ? "score"
          : "popularity",
    sort: filters.sort === "oldest" ? "asc" : "desc"
  });

  const sources: AnimeSource[] = sourcePage.data.map((anime) => {
    const type: MediaType = anime.type === "Movie" ? "movie" : "tv";
    const releaseDate = anime.aired?.from ?? undefined;
    return {
      malId: anime.mal_id,
      title: anime.title_english || anime.title,
      type,
      year: anime.year ?? yearOf(releaseDate),
      releaseDate,
      score: anime.score ?? undefined,
      genres: anime.genres?.map(({ name }) => name) ?? []
    };
  });

  const enrichment = await queryAniList<AniListEnrichment>(
    ANILIST_ENRICHMENT_QUERY,
    { malIds: sourcePage.data.map(({ mal_id }) => mal_id) },
    fetcher
  );
  const aniListByMalId = new Map(
    (enrichment.Page?.media ?? [])
      .filter((item): item is typeof item & { idMal: number } => typeof item.idMal === "number")
      .map((item) => [item.idMal, item])
  );

  const matched: Array<AnimeCatalogItem | null> = [];
  for (let index = 0; index < sources.length; index += TMDB_MATCH_CONCURRENCY) {
    const batch = sources.slice(index, index + TMDB_MATCH_CONCURRENCY);
    matched.push(
      ...(await Promise.all(
        batch.map(async (source): Promise<AnimeCatalogItem | null> => {
          const aniList = aniListByMalId.get(source.malId);
          const title = aniList?.title?.english || aniList?.title?.romaji || source.title;
          const year = aniList?.startDate?.year ?? source.year;
          const releaseDate = aniList?.startDate?.year
            ? [aniList.startDate.year, aniList.startDate.month, aniList.startDate.day]
                .filter((part): part is number => typeof part === "number")
                .map((part) => String(part).padStart(2, "0"))
                .join("-")
            : source.releaseDate;
          const response = (await requestJson(
            "TMDB",
            buildUrl(TMDB_BASE_URL, `/search/${source.type}`, {
              api_key: tmdbApiKey,
              language: "en-US",
              query: title,
              page: 1,
              include_adult: filters.adult,
              ...(year ? { [source.type === "movie" ? "year" : "first_air_date_year"]: year } : {})
            }),
            { fetcher }
          ).catch(() => null)) as TmdbSearchResponse | null;
          if (!response) return null;
          const match = response.results?.find((result) => result.id && result.poster_path);
          if (!match?.id || !match.poster_path) return null;
          return {
            tmdbId: String(match.id),
            title,
            type: source.type,
            year,
            releaseDate,
            posterUrl: `${POSTER_BASE_URL}${match.poster_path}`,
            voteAverage: aniList?.averageScore == null ? source.score : aniList.averageScore / 10,
            popularity: aniList?.popularity ?? undefined,
            genre: aniList?.genres ?? source.genres
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
    items,
    page: filters.page,
    totalPages: sourcePage.pagination.last_visible_page,
    totalResults: sourcePage.pagination.last_visible_page * 25
  };
}
