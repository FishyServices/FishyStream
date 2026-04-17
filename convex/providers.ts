import { v } from "convex/values";
import { action } from "./_generated/server";

// VidKing/VidSrc provider configuration
interface StreamSource {
  name: string;
  url: string;
  quality: string;
}

// Provider configurations
const PROVIDERS = {
  // VidKing provider
  vidking: {
    name: "VidKing",
    getMovieUrl: (imdbId: string) => `https://www.vidking.net/embed/movie/${imdbId}`,
    getTVUrl: (imdbId: string, season: number, episode: number) => 
      `https://www.vidking.net/embed/tv/${imdbId}/${season}/${episode}`,
  },
  
  // VidSrc provider (popular alternative)
  vidsrc: {
    name: "VidSrc",
    getMovieUrl: (imdbId: string) => `https://vidsrc.to/embed/movie/${imdbId}`,
    getTVUrl: (imdbId: string, season: number, episode: number) => 
      `https://vidsrc.to/embed/tv/${imdbId}/${season}-${episode}`,
  },
  
  // 2Embed provider
  twoEmbed: {
    name: "2Embed",
    getMovieUrl: (imdbId: string) => `https://www.2embed.cc/embed/${imdbId}`,
    getTVUrl: (imdbId: string, season: number, episode: number) => 
      `https://www.2embed.cc/embed/${imdbId}/${season}/${episode}`,
  },
  
  // SuperEmbed provider
  superEmbed: {
    name: "SuperEmbed",
    getMovieUrl: (imdbId: string) => `https://www.multiembed.mov/?video_id=${imdbId}`,
    getTVUrl: (imdbId: string, season: number, episode: number) => 
      `https://www.multiembed.mov/?video_id=${imdbId}&tmdb=1&season=${season}&episode=${episode}`,
  },
};

// Action to get streaming sources for a movie
export const getMovieSources = action({
  args: { 
    imdbId: v.string(),
    tmdbId: v.optional(v.string()) 
  },
  handler: async (_ctx, { imdbId }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];
    
    // Add all available providers
    sources.push({
      name: "VidKing",
      url: PROVIDERS.vidking.getMovieUrl(imdbId),
      quality: "1080p",
    });
    
    sources.push({
      name: "VidSrc",
      url: PROVIDERS.vidsrc.getMovieUrl(imdbId),
      quality: "1080p",
    });
    
    sources.push({
      name: "2Embed",
      url: PROVIDERS.twoEmbed.getMovieUrl(imdbId),
      quality: "720p",
    });
    
    sources.push({
      name: "SuperEmbed",
      url: PROVIDERS.superEmbed.getMovieUrl(imdbId),
      quality: "1080p",
    });
    
    return sources;
  },
});

// Action to get streaming sources for a TV show episode
export const getTVSources = action({
  args: { 
    imdbId: v.string(),
    season: v.number(),
    episode: v.number(),
    tmdbId: v.optional(v.string()) 
  },
  handler: async (_ctx, { imdbId, season, episode }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];
    
    sources.push({
      name: "VidKing",
      url: PROVIDERS.vidking.getTVUrl(imdbId, season, episode),
      quality: "1080p",
    });
    
    sources.push({
      name: "VidSrc",
      url: PROVIDERS.vidsrc.getTVUrl(imdbId, season, episode),
      quality: "1080p",
    });
    
    sources.push({
      name: "2Embed",
      url: PROVIDERS.twoEmbed.getTVUrl(imdbId, season, episode),
      quality: "720p",
    });
    
    sources.push({
      name: "SuperEmbed",
      url: PROVIDERS.superEmbed.getTVUrl(imdbId, season, episode),
      quality: "1080p",
    });
    
    return sources;
  },
});

// Action to check if a source is available (basic check)
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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      clearTimeout(timeout);
      
      return { 
        available: response.ok || response.status === 405, // 405 means HEAD not allowed but endpoint exists
        url 
      };
    } catch (error) {
      return { available: true, url }; // Assume available if we can't check
    }
  },
});

// Simple function to get sources without calling other actions
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
      quality: "1080p",
    });
    
    sources.push({
      name: "VidSrc",
      url: PROVIDERS.vidsrc.getMovieUrl(imdbId),
      quality: "1080p",
    });
    
    sources.push({
      name: "2Embed",
      url: PROVIDERS.twoEmbed.getMovieUrl(imdbId),
      quality: "720p",
    });
  } else {
    sources.push({
      name: "VidKing",
      url: PROVIDERS.vidking.getTVUrl(imdbId, season, episode),
      quality: "1080p",
    });
    
    sources.push({
      name: "VidSrc",
      url: PROVIDERS.vidsrc.getTVUrl(imdbId, season, episode),
      quality: "1080p",
    });
    
    sources.push({
      name: "2Embed",
      url: PROVIDERS.twoEmbed.getTVUrl(imdbId, season, episode),
      quality: "720p",
    });
  }
  
  return sources;
}

// Action to get the best available source
export const getBestSource = action({
  args: { 
    imdbId: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    season: v.optional(v.number()),
    episode: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<StreamSource | null> => {
    const { imdbId, type, season = 1, episode = 1 } = args;
    const sources = getSourcesForContent(imdbId, type, season, episode);
    return sources[0] || null;
  },
});

export const providers = {
  getMovieSources,
  getTVSources,
  checkSource,
  getBestSource,
};
