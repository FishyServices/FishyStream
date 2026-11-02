import { memoizeAsync } from "../../shared/async.js";
import {
  buildSearchCandidates,
  hasStrongTitleMatch,
  MATCH_THRESHOLD,
  scoreMedia
} from "./matching.js";
import { queryAniList } from "./request.js";
import type {
  AniListEpisodeAddress,
  AniListEpisodeQuery,
  AniListMedia,
  AniListSeasonQuery
} from "./types.js";

const SERIES_FORMATS: ReadonlySet<string> = new Set(["TV", "TV_SHORT", "ONA"]);

const SEARCH_FIELDS = `id format startDate { year month day } title { romaji english native } synonyms`;

const SEARCH_QUERY = `query ($search: String) { Page(page: 1, perPage: 5) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${SEARCH_FIELDS} } } }`;

const MEDIA_QUERY = `query ($id: Int) { Media(id: $id, type: ANIME) { ${SEARCH_FIELDS} idMal type episodes relations { edges { relationType node { ${SEARCH_FIELDS} type episodes } } } } }`;

interface PageResponse {
  Page?: { media?: AniListMedia[] | null } | null;
}

interface Scored {
  media: AniListMedia;
  score: number;
}

async function searchMedia(search: string): Promise<AniListMedia[]> {
  if (!search) return [];
  const data = await queryAniList<PageResponse>(SEARCH_QUERY, { search });
  return data.Page?.media ?? [];
}

const loadMediaById = memoizeAsync(
  async (id: string): Promise<AniListMedia | null> => {
    const data = await queryAniList<{ Media?: AniListMedia | null }>(MEDIA_QUERY, {
      id: Number(id)
    });
    return data.Media ?? null;
  },
  (id) => id
);

function fetchMediaById(id: string): Promise<AniListMedia | null> {
  return id ? loadMediaById(id) : Promise.resolve(null);
}

function pickBest(
  pool: Iterable<AniListMedia>,
  query: Required<Pick<AniListSeasonQuery, "title" | "season">> & Pick<AniListSeasonQuery, "year">,
  current?: Scored
): Scored | undefined {
  let best = current;
  for (const media of pool) {
    const score = scoreMedia(media, query.title, query.season, query.year);
    if (!best || score > best.score) best = { media, score };
  }
  return best;
}

async function loadAniListId(query: AniListSeasonQuery): Promise<string | null> {
  const { title, season, seasonTitle, year } = query;
  if (!title) return null;
  const scoring = { title, season, year };

  let best: Scored | undefined;
  for (const candidate of buildSearchCandidates(title, season, seasonTitle)) {
    best = pickBest(await searchMedia(candidate), scoring, best);
    if (best && (best.score >= MATCH_THRESHOLD || hasStrongTitleMatch(best.media, title, season))) {
      return String(best.media.id);
    }
  }

  return null;
}

const resolveAniListIdCached = memoizeAsync(loadAniListId, ({ title, season, seasonTitle, year }) =>
  JSON.stringify([
    title?.trim().toLocaleLowerCase(),
    season,
    seasonTitle?.trim().toLocaleLowerCase(),
    year
  ])
);

export function resolveAniListId(query: AniListSeasonQuery): Promise<string | null> {
  return resolveAniListIdCached(query);
}

function episodeCount(media: AniListMedia): number | undefined {
  const count = media.episodes ?? 0;
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : undefined;
}

function startDateValue(media: AniListMedia): number {
  const date = media.startDate;
  return (date?.year ?? 9999) * 10_000 + (date?.month ?? 12) * 100 + (date?.day ?? 31);
}

function sequelsOf(media: AniListMedia): AniListMedia[] {
  return (media.relations?.edges ?? [])
    .flatMap((edge) => {
      const node = edge.node;
      const isSeries = node?.type === "ANIME" && (!node.format || SERIES_FORMATS.has(node.format));
      return edge.relationType === "SEQUEL" && node && isSeries ? [node] : [];
    })
    .sort((a, b) => startDateValue(a) - startDateValue(b));
}

function toAddress(media: AniListMedia, episode: number): AniListEpisodeAddress {
  return {
    anilistId: String(media.id),
    malId: media.idMal ? String(media.idMal) : undefined,
    episode
  };
}

async function walkSequels(
  media: AniListMedia,
  episode: number,
  visited: Set<number>
): Promise<AniListEpisodeAddress> {
  visited.add(media.id);
  const ownCount = episodeCount(media);
  if (ownCount === undefined || episode <= ownCount) return toAddress(media, episode);

  let remaining = episode - ownCount;
  for (const sequel of sequelsOf(media)) {
    const full = (await fetchMediaById(String(sequel.id))) ?? sequel;
    const count = episodeCount(full);
    if (count === undefined || remaining <= count) return toAddress(full, remaining);

    if (!visited.has(full.id)) {
      const nested = await walkSequels(full, remaining, visited);
      if (nested.anilistId !== String(full.id)) return nested;
    }
    remaining -= count;
  }

  return toAddress(media, episode);
}

async function loadAniListEpisodeAddress(
  query: AniListEpisodeQuery
): Promise<AniListEpisodeAddress | null> {
  const episode = Math.max(1, Math.floor(query.episode));
  const anilistId = query.anilistId ?? (await resolveAniListId(query));
  if (!anilistId) return null;

  const media = await fetchMediaById(anilistId);
  return media ? walkSequels(media, episode, new Set()) : { anilistId, episode };
}

const resolveAniListEpisodeAddressCached = memoizeAsync(
  loadAniListEpisodeAddress,
  ({ anilistId, title, season, seasonTitle, year, episode }) =>
    JSON.stringify([
      anilistId,
      title?.trim().toLocaleLowerCase(),
      season,
      seasonTitle?.trim().toLocaleLowerCase(),
      year,
      episode
    ])
);

export function resolveAniListEpisodeAddress(
  query: AniListEpisodeQuery
): Promise<AniListEpisodeAddress | null> {
  return resolveAniListEpisodeAddressCached(query);
}
