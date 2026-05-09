import { v } from "convex/values";
import { action } from "./_generated/server";
import { mapCanonicalToProviderOrder } from "../shared/tvSeasonMappings";
import { STREAM_PROVIDERS, getProviderId } from "../shared/providerCatalog";

interface StreamSource {
  key: string;
  name: string;
  url: string;
  quality: string;
}

interface AniListSearchMedia {
  id: number;
  format?: string | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  } | null;
  synonyms?: string[] | null;
}

function normalizeAniListText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSeasonOrdinal(season: number) {
  const mod100 = season % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${season}th`;
  const mod10 = season % 10;
  if (mod10 === 1) return `${season}st`;
  if (mod10 === 2) return `${season}nd`;
  if (mod10 === 3) return `${season}rd`;
  return `${season}th`;
}

function buildAniListSearchCandidates(title: string, season: number, seasonTitle?: string) {
  const cleanedTitle = title.trim();
  const cleanedSeasonTitle = seasonTitle?.trim();
  const candidates = new Set<string>();

  if (cleanedSeasonTitle && normalizeAniListText(cleanedSeasonTitle) !== "season") {
    candidates.add(cleanedSeasonTitle);
    candidates.add(`${cleanedTitle} ${cleanedSeasonTitle}`);
  }

  candidates.add(cleanedTitle);

  if (season > 1) {
    const ordinal = getSeasonOrdinal(season);
    candidates.add(`${cleanedTitle} ${ordinal} season`);
    candidates.add(`${cleanedTitle} season ${season}`);
    candidates.add(`${cleanedTitle} ${season} season`);
    candidates.add(`${cleanedTitle} ${ordinal}`);
    candidates.add(`${cleanedTitle} ${season}`);
  }

  return [...candidates].filter(Boolean);
}

function scoreAniListCandidate(media: AniListSearchMedia, title: string, season: number) {
  const baseTitle = normalizeAniListText(title);
  const ordinal = getSeasonOrdinal(season);
  const seasonTokens =
    season <= 1
      ? ["1st season", "first season", "season 1"]
      : [
          `${ordinal} season`,
          `season ${season}`,
          `${season} season`,
          `${ordinal}`,
          `part ${season}`
        ];
  const antiSeasonTokens =
    season <= 1
      ? ["2nd season", "3rd season", "4th season", "season 2", "season 3", "season 4"]
      : [];
  const titles = [
    media.title?.romaji,
    media.title?.english,
    media.title?.native,
    ...(media.synonyms ?? [])
  ]
    .map((entry) => normalizeAniListText(entry))
    .filter(Boolean);

  if (!titles.length) return -1;

  let score = media.format === "TV" ? 4 : 0;

  for (const candidate of titles) {
    if (candidate === baseTitle) score += 12;
    else if (candidate.startsWith(baseTitle)) score += 8;
    else if (candidate.includes(baseTitle)) score += 5;

    if (seasonTokens.some((token) => candidate.includes(token))) score += 10;
    if (antiSeasonTokens.some((token) => candidate.includes(token))) score -= 8;
  }

  return score;
}

async function searchAniListCandidate(search: string): Promise<AniListSearchMedia[]> {
  if (!search) return [];

  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query: `
          query ($search: String) {
            Page(page: 1, perPage: 5) {
              media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                id
                format
                title {
                  romaji
                  english
                  native
                }
                synonyms
              }
            }
          }
        `,
        variables: { search }
      })
    });

    if (!response.ok) return [];

    const json = (await response.json()) as {
      data?: { Page?: { media?: AniListSearchMedia[] | null } | null };
    };

    return json.data?.Page?.media ?? [];
  } catch {
    return [];
  }
}

async function resolveAniListId(args: {
  title?: string;
  season: number;
  seasonTitle?: string;
}): Promise<string | null> {
  const { title, season, seasonTitle } = args;
  if (!title) return null;

  const searches = buildAniListSearchCandidates(title, season, seasonTitle);
  let bestMatch: AniListSearchMedia | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const search of searches) {
    const results = await searchAniListCandidate(search);

    for (const media of results) {
      const score = scoreAniListCandidate(media, title, season);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = media;
      }
    }

    if (bestScore >= 18 && bestMatch) {
      return String(bestMatch.id);
    }
  }

  return bestMatch ? String(bestMatch.id) : null;
}

export const getMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    for (const provider of STREAM_PROVIDERS) {
      if (provider.animeOnly) continue;

      const id = getProviderId(provider, imdbId, tmdbId);
      if (!id) continue;

      sources.push({
        key: provider.key,
        name: provider.name,
        url: provider.getMovieUrl(id),
        quality: provider.quality
      });
    }

    return sources;
  }
});

export const getTVSources = action({
  args: {
    imdbId: v.optional(v.string()),
    isAnime: v.optional(v.boolean()),
    season: v.number(),
    episode: v.number(),
    title: v.optional(v.string()),
    seasonTitle: v.optional(v.string()),
    tmdbId: v.optional(v.string()),
    dub: v.optional(v.boolean())
  },
  handler: async (
    _ctx,
    { imdbId, tmdbId, season, episode, isAnime, title, seasonTitle, dub }
  ): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];
    let resolvedAniListId: string | null | undefined;

    for (const provider of STREAM_PROVIDERS) {
      if (provider.animeOnly && !isAnime) continue;

      const defaultId = getProviderId(provider, imdbId, tmdbId);
      let animeId = defaultId;

      if (isAnime && provider.getAnimeTVUrl && provider.animeIdType === "anilist") {
        if (resolvedAniListId === undefined) {
          resolvedAniListId = await resolveAniListId({ title, season, seasonTitle });
        }
        animeId = resolvedAniListId;
      }

      const id = animeId ?? defaultId;
      if (!id) continue;
      const mapped = mapCanonicalToProviderOrder(tmdbId, provider.name, { season, episode });
      const url =
        isAnime && provider.getAnimeTVUrl && animeId
          ? provider.getAnimeTVUrl(id, mapped.season, mapped.episode, dub ?? false)
          : provider.getTVUrl(id, mapped.season, mapped.episode);

      sources.push({
        key: provider.key,
        name: provider.name,
        url,
        quality: provider.quality
      });
    }

    return sources;
  }
});

function frameBlockingHeader(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("deny") ||
    normalized.includes("sameorigin") ||
    normalized.includes("same-origin")
  );
}

export const checkSource = action({
  args: { url: v.string() },
  handler: async (_ctx, { url }): Promise<{ available: boolean; url: string }> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });

      clearTimeout(timeout);

      const xFrameOptions = response.headers.get("x-frame-options");
      const csp = response.headers.get("content-security-policy");
      const blockedByFrameOptions = frameBlockingHeader(xFrameOptions);
      const blockedByCsp = csp?.toLowerCase().includes("frame-ancestors 'self'") || false;

      return {
        available:
          response.ok || response.status === 405 ? !blockedByFrameOptions && !blockedByCsp : false,
        url
      };
    } catch {
      return { available: false, url };
    }
  }
});
