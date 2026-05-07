import { v } from "convex/values";
import { action } from "./_generated/server";
import { mapCanonicalToProviderOrder } from "../shared/tvSeasonMappings";

interface StreamSource {
  name: string;
  url: string;
  quality: string;
  supportsProgressEvents?: boolean;
}

interface ProviderConfig {
  name: string;
  idType: "tmdb" | "imdb" | "both";
  quality: string;
  supportsProgressEvents?: boolean;
  animeOnly?: boolean;
  animeIdType?: "same" | "anilist";
  getMovieUrl: (id: string) => string;
  getTVUrl: (id: string, season: number, episode: number) => string;
  getAnimeTVUrl?: (id: string, season: number, episode: number) => string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: "VidKing",
    idType: "tmdb",
    quality: "1080p",
    supportsProgressEvents: true,
    getMovieUrl: (tmdbId) => `https://www.vidking.net/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://www.vidking.net/embed/tv/${tmdbId}/${season}/${episode}`
  },
  {
    name: "VidFast",
    idType: "both",
    quality: "1080p",
    supportsProgressEvents: true,
    getMovieUrl: (id) => `https://vidfast.pro/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidfast.pro/tv/${id}/${season}/${episode}`
  },
  {
    name: "VidEasy",
    idType: "tmdb",
    quality: "1080p",
    supportsProgressEvents: true,
    getMovieUrl: (tmdbId) => `https://player.videasy.net/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}`
  },

  {
    name: "VidNest",
    idType: "tmdb",
    quality: "1080p",
    supportsProgressEvents: true,
    animeIdType: "anilist",
    getMovieUrl: (tmdbId) => `https://vidnest.fun/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) => `https://vidnest.fun/tv/${tmdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://vidnest.fun/anime/${aniListId}/${episode}/dub`
  },
  {
    name: "SuperEmbed",
    idType: "tmdb",
    quality: "1080p",
    getMovieUrl: (tmdbId) => `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1&season=${season}&episode=${episode}`
  },
  {
    name: "AutoEmbed",
    idType: "tmdb",
    quality: "1080p",
    getMovieUrl: (tmdbId) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
  },
  {
    name: "VidSrc",
    idType: "both",
    quality: "1080p",
    getMovieUrl: (id) => `https://vidsrc.icu/embed/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`
  },
  {
    name: "2Embed",
    idType: "imdb",
    quality: "720p",
    getMovieUrl: (imdbId) => `https://www.2embed.cc/embed/${imdbId}`,
    getTVUrl: (imdbId, season, episode) =>
      `https://www.2embed.cc/embed/${imdbId}/${season}/${episode}`
  }
];

function getProviderId(config: ProviderConfig, imdbId?: string, tmdbId?: string): string | null {
  if (config.idType === "tmdb" && tmdbId) return tmdbId;
  if (config.idType === "imdb" && imdbId?.startsWith("tt")) return imdbId;
  if (config.idType === "both") return imdbId || tmdbId || null;
  return null;
}

async function resolveAniListId(title?: string): Promise<string | null> {
  if (!title) return null;

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
            Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
              id
            }
          }
        `,
        variables: { search: title }
      })
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      data?: { Media?: { id?: number | null } | null };
    };
    const id = json.data?.Media?.id;
    return typeof id === "number" ? String(id) : null;
  } catch {
    return null;
  }
}

export const getMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    for (const config of PROVIDERS) {
      if (config.animeOnly) continue;

      const id = getProviderId(config, imdbId, tmdbId);
      if (!id) continue;

      sources.push({
        name: config.name,
        url: config.getMovieUrl(id),
        quality: config.quality,
        ...(config.supportsProgressEvents && { supportsProgressEvents: true })
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
    tmdbId: v.optional(v.string())
  },
  handler: async (
    _ctx,
    { imdbId, tmdbId, season, episode, isAnime, title }
  ): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    for (const config of PROVIDERS) {
      if (config.animeOnly && !isAnime) continue;

      const defaultId = getProviderId(config, imdbId, tmdbId);
      let animeId = defaultId;

      if (isAnime && config.getAnimeTVUrl && config.animeIdType === "anilist") {
        animeId = await resolveAniListId(title);
      }

      const id = animeId ?? defaultId;
      if (!id) continue;
      const mapped = mapCanonicalToProviderOrder(tmdbId, config.name, { season, episode });
      const url =
        isAnime && config.getAnimeTVUrl && animeId
          ? config.getAnimeTVUrl(id, mapped.season, mapped.episode)
          : config.getTVUrl(id, mapped.season, mapped.episode);

      sources.push({
        name: config.name,
        url,
        quality: config.quality,
        ...(config.supportsProgressEvents && { supportsProgressEvents: true })
      });
    }

    return sources;
  }
});

export const checkSource = action({
  args: { url: v.string() },
  handler: async (_ctx, { url }): Promise<{ available: boolean; url: string }> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });

      clearTimeout(timeout);

      return {
        available: response.ok || response.status === 405,
        url
      };
    } catch (error) {
      return { available: true, url };
    }
  }
});
