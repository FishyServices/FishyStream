import { memoizeAsync } from "../../shared/async.js";
import {
  buildSearchCandidates,
  hasStrongTitleMatch,
  isSpecialsEntry,
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

const SEARCH_FIELDS = `id format startDate { year month day } title { romaji english native } synonyms episodes duration`;

const SEARCH_QUERY = `query ($search: String) { Page(page: 1, perPage: 5) { media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${SEARCH_FIELDS} } } }`;

const MEDIA_QUERY = `query ($id: Int) { Media(id: $id, type: ANIME) { ${SEARCH_FIELDS} idMal type relations { edges { relationType node { ${SEARCH_FIELDS} idMal type relations { edges { relationType node { ${SEARCH_FIELDS} idMal type } } } } } } } }`;

export interface AniListWatchOrderItem {
  id: string;
  title: string;
  format?: string;
  episodes?: number;
  duration?: number;
  year?: number;
  relation?: string;
  seasonNumber?: number;
  franchiseTitle?: string;
}

function watchOrderItem(media: AniListMedia, relation?: string): AniListWatchOrderItem {
  return {
    id: String(media.id),
    title: media.title?.english || media.title?.romaji || media.title?.native || "Untitled",
    format: media.format ?? undefined,
    episodes: media.episodes ?? undefined,
    duration: media.duration ?? undefined,
    year: media.startDate?.year ?? undefined,
    relation
  };
}

export async function getAniListWatchOrder(id: string): Promise<AniListWatchOrderItem[]> {
  const root = await fetchMediaById(id);
  if (!root) return [];
  const chain = [root];
  const visited = new Set([root.id]);
  const firstPrequel = (root.relations?.edges ?? []).find(
    (edge) => edge.relationType === "PREQUEL" && edge.node?.type === "ANIME"
  )?.node;
  if (firstPrequel && !visited.has(firstPrequel.id)) {
    visited.add(firstPrequel.id);
    chain.push((await fetchMediaById(String(firstPrequel.id))) ?? firstPrequel);
  }
  let current = root;
  while (true) {
    const relations = current.relations?.edges ?? [];
    const next = relations.find(
      (edge) =>
        edge.relationType === "SEQUEL" && edge.node?.type === "ANIME" && !visited.has(edge.node.id)
    )?.node;
    const sideStory = relations.find(
      (edge) =>
        edge.relationType === "SIDE_STORY" &&
        edge.node?.type === "ANIME" &&
        !visited.has(edge.node.id)
    )?.node;
    if (sideStory) {
      visited.add(sideStory.id);
      chain.push((await fetchMediaById(String(sideStory.id))) ?? sideStory);
    }
    if (!next) break;
    visited.add(next.id);
    current = (await fetchMediaById(String(next.id))) ?? next;
    chain.push(current);
  }
  const franchiseTitle =
    root.title?.english || root.title?.romaji || root.title?.native || undefined;
  let seasonNumber = 0;
  return chain.map((item, index) => {
    const isSeason = item.format === "TV" || item.format === "TV_SHORT";
    if (isSeason) seasonNumber += 1;
    return {
      ...watchOrderItem(item, index ? "Related" : undefined),
      ...(isSeason ? { seasonNumber, franchiseTitle } : {})
    };
  });
}

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

export function getAniListMediaById(id: string): Promise<AniListMedia | null> {
  return fetchMediaById(id);
}

function pickBest(
  pool: Iterable<AniListMedia>,
  query: Required<Pick<AniListSeasonQuery, "title" | "season">> &
    Pick<AniListSeasonQuery, "year" | "episodes">,
  current?: Scored
): Scored | undefined {
  let best = current;
  for (const media of pool) {
    if (query.season === 0 && !isSpecialsEntry(media)) continue;
    const score = scoreMedia(media, query.title, query.season, query.year, query.episodes);
    if (!best || score > best.score) best = { media, score };
  }
  return best;
}

async function loadAniListId(query: AniListSeasonQuery): Promise<string | null> {
  const { title, season, seasonTitle, year, episodes } = query;
  if (!title) return null;
  const scoring = { title, season, year, episodes };

  let best: Scored | undefined;
  for (const candidate of buildSearchCandidates(title, season, seasonTitle)) {
    const results = await searchMedia(candidate);
    best = pickBest(results, scoring, best);
    if (season === 0) {
      console.info("[AniList matching] Specials search", {
        title,
        seasonTitle,
        query: candidate,
        results: results.map((media) => ({
          id: media.id,
          title: media.title,
          format: media.format,
          episodes: media.episodes,
          duration: media.duration,
          score: scoreMedia(media, title, season, year, episodes),
          isSpecials: isSpecialsEntry(media)
        })),
        best: best ? { id: best.media.id, title: best.media.title, score: best.score } : null
      });
    }
    if (season === 0) continue;
    if (best && (best.score >= MATCH_THRESHOLD || hasStrongTitleMatch(best.media, title, season))) {
      return String(best.media.id);
    }
  }

  if (season === 0 && episodes?.length) {
    for (const { name } of episodes) {
      const results = await searchMedia(name);
      best = pickBest(results, scoring, best);
      console.info("[AniList matching] Specials episode search", {
        episodeTitle: name,
        results: results.map((media) => ({
          id: media.id,
          title: media.title,
          format: media.format,
          episodes: media.episodes,
          duration: media.duration,
          score: scoreMedia(media, title, season, year, episodes),
          isSpecials: isSpecialsEntry(media)
        })),
        best: best ? { id: best.media.id, title: best.media.title, score: best.score } : null
      });
    }
  }

  if (season === 0) {
    return best &&
      isSpecialsEntry(best.media) &&
      (best.score >= MATCH_THRESHOLD || hasStrongTitleMatch(best.media, title, season))
      ? String(best.media.id)
      : null;
  }

  return null;
}

const resolveAniListIdCached = memoizeAsync(
  loadAniListId,
  ({ title, season, seasonTitle, year, episodes }) =>
    JSON.stringify([
      title?.trim().toLocaleLowerCase(),
      season,
      seasonTitle?.trim().toLocaleLowerCase(),
      year,
      episodes?.map(({ name, runtime }) => [name, runtime])
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
  const address = media ? await walkSequels(media, episode, new Set()) : { anilistId, episode };
  console.info("[AniList matching] Episode address", {
    requestedId: anilistId,
    resolvedId: address.anilistId,
    episode,
    season: query.season,
    title: query.title,
    mediaTitle: media?.title
  });
  return address;
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
