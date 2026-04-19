import { v } from "convex/values";
import { action } from "./_generated/server";

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
  getMovieUrl: (id: string) => string;
  getTVUrl: (id: string, season: number, episode: number) => string;
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

export const getMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    for (const config of PROVIDERS) {
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
    season: v.number(),
    episode: v.number(),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId, season, episode }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    for (const config of PROVIDERS) {
      const id = getProviderId(config, imdbId, tmdbId);
      if (!id) continue;

      sources.push({
        name: config.name,
        url: config.getTVUrl(id, season, episode),
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

function getSourcesForContent(
  imdbId: string,
  type: "movie" | "tv",
  season: number = 1,
  episode: number = 1
): StreamSource[] {
  const sources: StreamSource[] = [];

  for (const config of PROVIDERS) {
    const id = getProviderId(config, imdbId, type === "movie" ? undefined : imdbId);
    if (!id) continue;

    const url = type === "movie" ? config.getMovieUrl(id) : config.getTVUrl(id, season, episode);

    sources.push({
      name: config.name,
      url,
      quality: config.quality,
      ...(config.supportsProgressEvents && { supportsProgressEvents: true })
    });
  }

  return sources;
}

export const getBestSource = action({
  args: {
    imdbId: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    season: v.optional(v.number()),
    episode: v.optional(v.number())
  },
  handler: async (_ctx, args): Promise<StreamSource | null> => {
    const { imdbId, type, season = 1, episode = 1 } = args;
    const sources = getSourcesForContent(imdbId, type, season, episode);
    return sources[0] || null;
  }
});

export const providers = {
  getMovieSources,
  getTVSources,
  checkSource,
  getBestSource
};
