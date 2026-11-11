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

function isShortFormSideStory(media: AniListMedia): boolean {
  return media.format === "ONA" && (media.duration ?? Infinity) <= 5;
}

function titleAliases(media: AniListMedia): Set<string> {
  return new Set(
    [media.title?.english, media.title?.romaji, media.title?.native, ...(media.synonyms ?? [])]
      .filter((title): title is string => Boolean(title))
      .map((title) =>
        title
          .normalize("NFKD")
          .replace(/\p{Diacritic}/gu, "")
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim()
      )
      .filter(Boolean)
  );
}

function sameAnimeEntry(left: AniListMedia, right: AniListMedia): boolean {
  if (left.id === right.id) return true;
  if (left.idMal && right.idMal && left.idMal === right.idMal) return true;
  if (left.format !== right.format) return false;
  if (
    left.startDate?.year &&
    right.startDate?.year &&
    left.startDate.year !== right.startDate.year
  ) {
    return false;
  }
  if (left.episodes && right.episodes && left.episodes !== right.episodes) return false;
  if (left.duration && right.duration && left.duration !== right.duration) return false;

  const rightAliases = titleAliases(right);
  return [...titleAliases(left)].some((alias) => rightAliases.has(alias));
}

function dedupeAnimeEntries(items: AniListMedia[]): AniListMedia[] {
  const unique: AniListMedia[] = [];
  for (const item of items) {
    const duplicateIndex = unique.findIndex((candidate) => sameAnimeEntry(candidate, item));
    if (duplicateIndex < 0) {
      unique.push(item);
      continue;
    }

    const current = unique[duplicateIndex];
    if (current && !current.title?.english && item.title?.english) unique[duplicateIndex] = item;
  }
  return unique;
}

export async function getAniListWatchOrder(id: string): Promise<AniListWatchOrderItem[]> {
  const root = await fetchMediaById(id);
  if (!root) return [];
  const prequelPath = new Set<number>([root.id]);
  const visited = new Set<number>();
  const seriesRelation = (media: AniListMedia, relation: string) =>
    (media.relations?.edges ?? []).find(
      (edge) => edge.relationType === relation && edge.node?.type === "ANIME"
    )?.node;
  const load = async (media: AniListMedia) => (await fetchMediaById(String(media.id))) ?? media;

  let first = root;
  while (true) {
    const prequel = seriesRelation(first, "PREQUEL");
    if (!prequel || prequelPath.has(prequel.id)) break;
    prequelPath.add(prequel.id);
    first = await load(prequel);
  }

  const chain: AniListMedia[] = [];
  let current: AniListMedia | undefined = first;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    const sideStory = seriesRelation(current, "SIDE_STORY");
    if (sideStory && !visited.has(sideStory.id)) {
      visited.add(sideStory.id);
      chain.push(await load(sideStory));
    }
    const sequel = seriesRelation(current, "SEQUEL");
    current = sequel && !visited.has(sequel.id) ? await load(sequel) : undefined;
  }
  let seasonNumber = 0;
  const ordered = dedupeAnimeEntries(chain)
    .filter((item) => !isShortFormSideStory(item))
    .sort((a, b) => startDateValue(a) - startDateValue(b));
  const franchiseRoot = ordered.find((item) => item.format === "TV" || item.format === "TV_SHORT");
  const franchiseMedia = franchiseRoot ?? root;
  const franchiseTitle =
    franchiseMedia.title?.english ||
    franchiseMedia.title?.romaji ||
    franchiseMedia.title?.native ||
    undefined;
  return ordered.map((item, index) => {
    const isSeason = item.format === "TV" || item.format === "TV_SHORT";
    if (isSeason) seasonNumber += 1;
    return {
      ...watchOrderItem(item, index ? "Related" : undefined),
      franchiseTitle,
      ...(isSeason ? { seasonNumber } : {})
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
  const relationRoots: AniListMedia[] = [];
  for (const candidate of buildSearchCandidates(title, season, seasonTitle)) {
    const results = await searchMedia(candidate);
    best = pickBest(results, scoring, best);
    if (season > 1) {
      for (const media of results) {
        if (
          hasStrongTitleMatch(media, title, 1) &&
          !relationRoots.some((root) => root.id === media.id)
        ) {
          relationRoots.push(media);
        }
      }
    }
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

  if (season > 1) {
    for (const root of relationRoots) {
      let current: AniListMedia | null = await fetchMediaById(String(root.id));
      const visited = new Set<number>();
      let seasonNumber = 1;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const sequel = (current.relations?.edges ?? []).find(
          (edge) => edge.relationType === "SEQUEL" && edge.node?.type === "ANIME"
        )?.node;
        if (!sequel || visited.has(sequel.id)) break;
        current = (await fetchMediaById(String(sequel.id))) ?? sequel;
        seasonNumber += 1;
        if (seasonNumber === season) return String(current.id);
      }
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
