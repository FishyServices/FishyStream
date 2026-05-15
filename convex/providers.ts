import { v } from "convex/values";
import { action } from "./_generated/server";
import { mapCanonicalToProviderOrder } from "../shared/tvSeasonMappings";
import { STREAM_PROVIDERS, getProviderId } from "../shared/providerCatalog";
import { resolveAniListId } from "../shared/anilistResolver";

interface StreamSource {
  key: string;
  name: string;
  url: string;
  quality: string;
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
    year: v.optional(v.number()),
    tmdbId: v.optional(v.string()),
    anilistId: v.optional(v.string()),
    dub: v.optional(v.boolean())
  },
  handler: async (
    _ctx,
    { imdbId, tmdbId, anilistId, season, episode, isAnime, title, seasonTitle, year, dub }
  ): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];
    let resolvedAniListId: string | null | undefined = undefined;

    for (const provider of STREAM_PROVIDERS) {
      if (provider.animeOnly && !isAnime) continue;

      const defaultId = getProviderId(provider, imdbId, tmdbId);
      let animeId = defaultId;

      if (isAnime && provider.getAnimeTVUrl && provider.animeIdType === "anilist") {
        if (resolvedAniListId === undefined) {
          resolvedAniListId =
            (title
              ? await resolveAniListId({
                  title,
                  season,
                  seasonTitle,
                  year
                })
              : null) ?? anilistId ?? null;
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
