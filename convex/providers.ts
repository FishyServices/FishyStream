import { v } from "convex/values";
import { action } from "./_generated/server";

interface StreamSource {
  name: string;
  url: string;
  quality: string;
  supportsProgressEvents?: boolean;
}

const PROVIDERS = {
  superEmbed: {
    name: "SuperEmbed",
    getMovieUrl: (tmdbId: string) => `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
    getTVUrl: (tmdbId: string, season: number, episode: number) =>
      `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1&season=${season}&episode=${episode}`
  },

  vidsrc: {
    name: "VidSrc",
    getMovieUrl: (id: string) => `https://vidsrc.icu/embed/movie/${id}`,
    getTVUrl: (id: string, season: number, episode: number) =>
      `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`
  },

  twoEmbed: {
    name: "2Embed",
    getMovieUrl: (imdbId: string) => `https://www.2embed.cc/embed/${imdbId}`,
    getTVUrl: (imdbId: string, season: number, episode: number) =>
      `https://www.2embed.cc/embed/${imdbId}/${season}/${episode}`
  },

  autoembed: {
    name: "AutoEmbed",
    getMovieUrl: (tmdbId: string) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: string, season: number, episode: number) =>
      `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
  },

  vidking: {
    name: "VidKing",
    getMovieUrl: (tmdbId: string) => `https://www.vidking.net/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId: string, season: number, episode: number) =>
      `https://www.vidking.net/embed/tv/${tmdbId}/${season}/${episode}`
  }
};

export const getMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    if (tmdbId) {
      sources.push({
        name: "VidKing",
        url: PROVIDERS.vidking.getMovieUrl(tmdbId),
        quality: "1080p",
        supportsProgressEvents: true
      });
    }

    if (tmdbId) {
      sources.push({
        name: "SuperEmbed",
        url: PROVIDERS.superEmbed.getMovieUrl(tmdbId),
        quality: "1080p"
      });
    }

    const vidsrcId = imdbId || tmdbId;
    if (vidsrcId) {
      sources.push({
        name: "VidSrc",
        url: PROVIDERS.vidsrc.getMovieUrl(vidsrcId),
        quality: "1080p"
      });
    }

    if (tmdbId) {
      sources.push({
        name: "AutoEmbed",
        url: PROVIDERS.autoembed.getMovieUrl(tmdbId),
        quality: "1080p"
      });
    }

    if (imdbId && imdbId.startsWith("tt")) {
      sources.push({
        name: "2Embed",
        url: PROVIDERS.twoEmbed.getMovieUrl(imdbId),
        quality: "720p"
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

    if (tmdbId) {
      sources.push({
        name: "VidKing",
        url: PROVIDERS.vidking.getTVUrl(tmdbId, season, episode),
        quality: "1080p",
        supportsProgressEvents: true
      });
    }

    if (tmdbId) {
      sources.push({
        name: "SuperEmbed",
        url: PROVIDERS.superEmbed.getTVUrl(tmdbId, season, episode),
        quality: "1080p"
      });
    }

    const vidsrcId = imdbId || tmdbId;
    if (vidsrcId) {
      sources.push({
        name: "VidSrc",
        url: PROVIDERS.vidsrc.getTVUrl(vidsrcId, season, episode),
        quality: "1080p"
      });
    }

    if (tmdbId) {
      sources.push({
        name: "AutoEmbed",
        url: PROVIDERS.autoembed.getTVUrl(tmdbId, season, episode),
        quality: "1080p"
      });
    }

    if (imdbId && imdbId.startsWith("tt")) {
      sources.push({
        name: "2Embed",
        url: PROVIDERS.twoEmbed.getTVUrl(imdbId, season, episode),
        quality: "720p"
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

  if (type === "movie") {
    sources.push({
      name: "VidKing",
      url: PROVIDERS.vidking.getMovieUrl(imdbId),
      quality: "1080p"
    });

    sources.push({
      name: "VidSrc",
      url: PROVIDERS.vidsrc.getMovieUrl(imdbId),
      quality: "1080p"
    });

    sources.push({
      name: "2Embed",
      url: PROVIDERS.twoEmbed.getMovieUrl(imdbId),
      quality: "720p"
    });
  } else {
    sources.push({
      name: "VidKing",
      url: PROVIDERS.vidking.getTVUrl(imdbId, season, episode),
      quality: "1080p"
    });

    sources.push({
      name: "VidSrc",
      url: PROVIDERS.vidsrc.getTVUrl(imdbId, season, episode),
      quality: "1080p"
    });

    sources.push({
      name: "2Embed",
      url: PROVIDERS.twoEmbed.getTVUrl(imdbId, season, episode),
      quality: "720p"
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
