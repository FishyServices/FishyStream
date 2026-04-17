import { v } from "convex/values";
import { action } from "./_generated/server";

export interface StreamSource {
  name: string;
  url: string;
  quality: string;
  supportsProgressEvents?: boolean;
}

const PROVIDERS = {
  vidsrc: {
    name: "VidSrc Pro",
    movie: (id: string) => `https://vidsrc.pro/embed/movie/${id}`,
    tv: (id: string, s: number, e: number) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`
  },
  vidsrc2: {
    name: "VidSrc",
    movie: (id: string) => `https://vidsrc.icu/embed/movie/${id}`,
    tv: (id: string, s: number, e: number) => `https://vidsrc.icu/embed/tv/${id}/${s}/${e}`
  },
  superembed: {
    name: "SuperEmbed",
    movie: (id: string) => `https://www.multiembed.mov/?video_id=${id}&tmdb=1`,
    tv: (id: string, s: number, e: number) =>
      `https://www.multiembed.mov/?video_id=${id}&tmdb=1&season=${s}&episode=${e}`
  },
  autoembed: {
    name: "AutoEmbed",
    movie: (id: string) => `https://player.autoembed.cc/embed/movie/${id}`,
    tv: (id: string, s: number, e: number) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`
  },
  embed2: {
    name: "2Embed",
    movie: (imdb: string) => `https://www.2embed.cc/embed/${imdb}`,
    tv: (imdb: string, s: number, e: number) =>
      `https://www.2embed.cc/embedtv/${imdb}&s=${s}&e=${e}`
  },
  smashystream: {
    name: "SmashyStream",
    movie: (id: string) => `https://embed.smashystream.com/playere.php?tmdb=${id}`,
    tv: (id: string, s: number, e: number) =>
      `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`
  }
};

export const getMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];
    const id = tmdbId ?? imdbId ?? "";

    if (tmdbId) {
      sources.push({
        name: PROVIDERS.vidsrc.name,
        url: PROVIDERS.vidsrc.movie(tmdbId),
        quality: "1080p",
        supportsProgressEvents: false
      });
      sources.push({
        name: PROVIDERS.superembed.name,
        url: PROVIDERS.superembed.movie(tmdbId),
        quality: "1080p"
      });
      sources.push({
        name: PROVIDERS.autoembed.name,
        url: PROVIDERS.autoembed.movie(tmdbId),
        quality: "1080p"
      });
      sources.push({
        name: PROVIDERS.smashystream.name,
        url: PROVIDERS.smashystream.movie(tmdbId),
        quality: "1080p"
      });
    }

    if (imdbId) {
      sources.push({
        name: PROVIDERS.vidsrc2.name,
        url: PROVIDERS.vidsrc2.movie(imdbId),
        quality: "1080p"
      });
      if (imdbId.startsWith("tt")) {
        sources.push({
          name: PROVIDERS.embed2.name,
          url: PROVIDERS.embed2.movie(imdbId),
          quality: "720p"
        });
      }
    }

    return sources;
  }
});

export const getTVSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string()),
    season: v.number(),
    episode: v.number()
  },
  handler: async (_ctx, { imdbId, tmdbId, season, episode }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    if (tmdbId) {
      sources.push({
        name: PROVIDERS.vidsrc.name,
        url: PROVIDERS.vidsrc.tv(tmdbId, season, episode),
        quality: "1080p"
      });
      sources.push({
        name: PROVIDERS.superembed.name,
        url: PROVIDERS.superembed.tv(tmdbId, season, episode),
        quality: "1080p"
      });
      sources.push({
        name: PROVIDERS.autoembed.name,
        url: PROVIDERS.autoembed.tv(tmdbId, season, episode),
        quality: "1080p"
      });
      sources.push({
        name: PROVIDERS.smashystream.name,
        url: PROVIDERS.smashystream.tv(tmdbId, season, episode),
        quality: "1080p"
      });
    }

    if (imdbId) {
      sources.push({
        name: PROVIDERS.vidsrc2.name,
        url: PROVIDERS.vidsrc2.tv(imdbId, season, episode),
        quality: "1080p"
      });
      if (imdbId.startsWith("tt")) {
        sources.push({
          name: PROVIDERS.embed2.name,
          url: PROVIDERS.embed2.tv(imdbId, season, episode),
          quality: "720p"
        });
      }
    }

    return sources;
  }
});
