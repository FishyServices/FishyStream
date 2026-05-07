export type ProviderKey =
  | "vidking"
  | "vidfast"
  | "videasy"
  | "vidnest"
  | "superembed"
  | "autoembed"
  | "vidsrc"
  | "2embed";

export interface ProviderProgressConfig {
  origins: string[];
  controlApi?: boolean;
  statusRequest?: boolean;
}

export interface ProviderCatalogEntry {
  key: ProviderKey;
  name: string;
  idType: "tmdb" | "imdb" | "both";
  quality: string;
  animeOnly?: boolean;
  animeIdType?: "same" | "anilist";
  progress?: ProviderProgressConfig;
  getMovieUrl: (id: string) => string;
  getTVUrl: (id: string, season: number, episode: number) => string;
  getAnimeTVUrl?: (id: string, season: number, episode: number) => string;
}

export const STREAM_PROVIDERS: ProviderCatalogEntry[] = [
  {
    key: "vidking",
    name: "VidKing",
    idType: "tmdb",
    quality: "1080p",
    progress: {
      origins: ["https://www.vidking.net"]
    },
    getMovieUrl: (tmdbId) => `https://www.vidking.net/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://www.vidking.net/embed/tv/${tmdbId}/${season}/${episode}`
  },
  {
    key: "vidfast",
    name: "VidFast",
    idType: "both",
    quality: "1080p",
    progress: {
      origins: [
        "https://vidfast.pro",
        "https://vidfast.in",
        "https://vidfast.io",
        "https://vidfast.me",
        "https://vidfast.net",
        "https://vidfast.pm",
        "https://vidfast.xyz"
      ],
      controlApi: true,
      statusRequest: true
    },
    getMovieUrl: (id) => `https://vidfast.pro/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidfast.pro/tv/${id}/${season}/${episode}`
  },
  {
    key: "videasy",
    name: "VidEasy",
    idType: "tmdb",
    quality: "1080p",
    progress: {
      origins: ["https://player.videasy.net", "https://videasy.net"]
    },
    getMovieUrl: (tmdbId) => `https://player.videasy.net/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}`
  },
  {
    key: "vidnest",
    name: "VidNest",
    idType: "tmdb",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["https://vidnest.fun"]
    },
    getMovieUrl: (tmdbId) => `https://vidnest.fun/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) => `https://vidnest.fun/tv/${tmdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://vidnest.fun/anime/${aniListId}/${episode}/dub`
  },
  {
    key: "superembed",
    name: "SuperEmbed",
    idType: "tmdb",
    quality: "1080p",
    getMovieUrl: (tmdbId) => `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1&season=${season}&episode=${episode}`
  },
  {
    key: "autoembed",
    name: "AutoEmbed",
    idType: "tmdb",
    quality: "1080p",
    getMovieUrl: (tmdbId) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
  },
  {
    key: "vidsrc",
    name: "VidSrc",
    idType: "both",
    quality: "1080p",
    getMovieUrl: (id) => `https://vidsrc.icu/embed/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`
  },
  {
    key: "2embed",
    name: "2Embed",
    idType: "imdb",
    quality: "720p",
    getMovieUrl: (imdbId) => `https://www.2embed.cc/embed/${imdbId}`,
    getTVUrl: (imdbId, season, episode) =>
      `https://www.2embed.cc/embed/${imdbId}/${season}/${episode}`
  }
];

export function getProviderByKey(key: string): ProviderCatalogEntry | undefined {
  return STREAM_PROVIDERS.find((provider) => provider.key === key);
}

export function getProviderByOrigin(origin: string): ProviderCatalogEntry | undefined {
  return STREAM_PROVIDERS.find((provider) => provider.progress?.origins.includes(origin));
}

export function getProviderId(
  provider: ProviderCatalogEntry,
  imdbId?: string,
  tmdbId?: string
): string | null {
  if (provider.idType === "tmdb" && tmdbId) return tmdbId;
  if (provider.idType === "imdb" && imdbId?.startsWith("tt")) return imdbId;
  if (provider.idType === "both") return imdbId || tmdbId || null;
  return null;
}
