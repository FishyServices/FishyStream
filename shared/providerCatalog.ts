export type ProviderKey =
  | "vidking"
  | "vidfast"
  | "videasy"
  | "vidnest"
  | "vidrock"
  | "vidplus (ads)"
  | "filmu"
  | "vidzen"
  | "vixsrc"
  //| "cinezo"
  | "mafiaembed"
  | "superembed"
  | "autoembed"
  | "vidsrc"
  | "2embed";

export interface ProviderProgressConfig {
  origins: string[];
  controlApi?: boolean;
  statusRequest?: boolean;
  resumeParam?: "progress" | "startAt";
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
      origins: ["*"],
      resumeParam: "progress"
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
      origins: ["*"],
      controlApi: true,
      statusRequest: true,
      resumeParam: "startAt"
    },
    getMovieUrl: (id) => `https://vidfast.pro/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidfast.pro/tv/${id}/${season}/${episode}`
  },
  {
    key: "videasy",
    name: "VidEasy",
    idType: "tmdb",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["*"],
      resumeParam: "progress"
    },
    getMovieUrl: (tmdbId) => `https://player.videasy.net/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://player.videasy.net/anime/${aniListId}/${episode}`
  },
  {
    key: "vidnest",
    name: "VidNest",
    idType: "tmdb",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["*"],
      resumeParam: "progress"
    },
    getMovieUrl: (tmdbId) => `https://vidnest.fun/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) => `https://vidnest.fun/tv/${tmdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://vidnest.fun/anime/${aniListId}/${episode}/dub`
  },
  {
    key: "vidrock",
    name: "VidRock",
    idType: "both",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["*"]
    },
    getMovieUrl: (id) => `https://vidrock.ru/embed/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidrock.ru/embed/tv/${id}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://vidrock.ru/embed/anime/${aniListId}/${episode}`
  },
  {
    key: "vidplus (ads)",
    name: "VidPlus (Ads)",
    idType: "both",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["*"]
    },
    getMovieUrl: (id) => `https://player.vidplus.to/embed/movie/${id}`,
    getTVUrl: (id, season, episode) =>
      `https://player.vidplus.to/embed/tv/${id}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://player.vidplus.to/embed/anime/${aniListId}/${episode}?dub=true`
  },
  {
    key: "filmu",
    name: "filmu",
    idType: "both",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["*"]
    },
    getMovieUrl: (id) => `https://embed.filmu.in/embed/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://embed.filmu.in/embed/tv/${id}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://embed.filmu.in/embed/anime/${aniListId}/${episode}?dub=true`
  },
  {
    key: "vidzen",
    name: "VidZen",
    idType: "tmdb",
    quality: "1080p",
    progress: {
      origins: ["*"],
      resumeParam: "startAt"
    },
    getMovieUrl: (tmdbId) => `https://vidzen.fun/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) => `https://vidzen.fun/tv/${tmdbId}/${season}/${episode}`
  },
  {
    key: "vixsrc",
    name: "VixSrc",
    idType: "tmdb",
    quality: "1080p",
    progress: {
      origins: ["*"],
      resumeParam: "startAt"
    },
    getMovieUrl: (tmdbId) => `https://vixsrc.to/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) => `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`
  },
  /*
  {
    key: "cinezo",
    name: "Cinezo",
    idType: "tmdb",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["*"],
      resumeParam: "startAt"
    },
    getMovieUrl: (tmdbId) => `https://player.vidrush.net/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.vidrush.net/embed/tv/${tmdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://player.vidrush.net/embed/anime/${aniListId}/${episode}?dub=true`
  },
  */
  {
    key: "mafiaembed",
    name: "MafiaEmbed",
    idType: "tmdb",
    quality: "1080p",
    animeIdType: "anilist",
    progress: {
      origins: ["*"],
      resumeParam: "progress"
    },
    getMovieUrl: (tmdbId) => `https://embed.streammafia.to/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://embed.streammafia.to/embed/tv/${tmdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://embed.streammafia.to/embed/anime/${aniListId}/${episode}?dub=true`
  },
  {
    key: "superembed",
    name: "SuperEmbed",
    idType: "tmdb",
    quality: "1080p",
    animeIdType: "anilist",
    getMovieUrl: (tmdbId) => `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://www.multiembed.mov/?video_id=${tmdbId}&tmdb=1&season=${season}&episode=${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://www.multiembed.mov/?video_id=${aniListId}&anime=1&episode=${episode}&dub=1`
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
    animeIdType: "anilist",
    getMovieUrl: (id) => `https://vidsrc.icu/embed/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://vidsrc.icu/embed/anime/${aniListId}/${episode}/1`
  },
  {
    key: "2embed",
    name: "2Embed",
    idType: "imdb",
    quality: "720p",
    animeIdType: "anilist",
    getMovieUrl: (imdbId) => `https://www.2embed.cc/embed/${imdbId}`,
    getTVUrl: (imdbId, season, episode) =>
      `https://www.2embed.cc/embed/${imdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://www.2embed.cc/embed/anime/${aniListId}/${episode}`
  }
];

export function getProviderByKey(key: string): ProviderCatalogEntry | undefined {
  return STREAM_PROVIDERS.find((provider) => provider.key === key);
}

export function getProviderByOrigin(origin: string): ProviderCatalogEntry | undefined {
  return STREAM_PROVIDERS.find((provider) => {
    const origins = provider.progress?.origins;
    return !!origins && (origins.includes("*") || origins.includes(origin));
  });
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
