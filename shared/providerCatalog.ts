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
  | "vidsrc pro"
  | "cinezo"
  | "mafiaembed"
  | "superembed"
  | "autoembed"
  | "vidsrc"
  | "2embed";

export type ProviderCategory = "primary" | "anime" | "fallback";

export interface ProviderProgressConfig {
  origins: string[];
  controlApi?: boolean;
  statusRequest?: boolean;
  resumeParam?: "progress" | "startAt";
}

export interface ProviderCatalogEntry {
  key: ProviderKey;
  name: string;
  category: ProviderCategory;
  idType: "tmdb" | "imdb" | "both";
  quality: string;
  website?: string;
  notes?: string;
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
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://www.vidking.net",
    notes: "Fast TMDB embed",
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
    category: "primary",
    idType: "both",
    quality: "1080p",
    website: "https://vidfast.pro",
    notes: "IMDb or TMDB",
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
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.videasy.net",
    notes: "Anime via AniList",
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
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vidnest.fun",
    notes: "Anime dub support",
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
    category: "anime",
    idType: "both",
    quality: "1080p",
    website: "https://vidrock.ru",
    notes: "IMDb or TMDB with anime",
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
    category: "fallback",
    idType: "both",
    quality: "1080p",
    website: "https://player.vidplus.to",
    notes: "Includes ads",
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
    category: "anime",
    idType: "both",
    quality: "1080p",
    website: "https://embed.filmu.in",
    notes: "Anime and TV",
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
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vidzen.fun",
    notes: "TMDB-first source",
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
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vixsrc.to",
    notes: "TMDB embed",
    progress: {
      origins: ["*"],
      resumeParam: "startAt"
    },
    getMovieUrl: (tmdbId) => `https://vixsrc.to/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) => `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`
  },
  {
    key: "vidsrc pro",
    name: "VidSrc Pro",
    category: "primary",
    idType: "both",
    quality: "1080p",
    website: "https://vidsrc.mov",
    notes: "Current VidSrc API",
    getMovieUrl: (id) => `https://vidsrc.mov/embed/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidsrc.mov/embed/tv/${id}/${season}/${episode}`
  },
  {
    key: "cinezo",
    name: "Cinezo",
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.cinezo.live",
    notes: "Customizable player with anime",
    animeIdType: "anilist",
    progress: {
      origins: ["*"],
      resumeParam: "startAt"
    },
    getMovieUrl: (tmdbId) => `https://player.cinezo.live/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.cinezo.live/embed/tv/${tmdbId}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://player.cinezo.live/embed/anime/${aniListId}/${episode}?dub=true`
  },
  {
    key: "mafiaembed",
    name: "MafiaEmbed",
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://embed.streammafia.to",
    notes: "Anime and TV",
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
    category: "fallback",
    idType: "tmdb",
    quality: "1080p",
    website: "https://www.multiembed.mov",
    notes: "Multiembed endpoint",
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
    category: "fallback",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.autoembed.cc",
    notes: "Basic TMDB embed",
    getMovieUrl: (tmdbId) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    getTVUrl: (tmdbId, season, episode) =>
      `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`
  },
  {
    key: "vidsrc",
    name: "VidSrc",
    category: "anime",
    idType: "both",
    quality: "1080p",
    website: "https://vidsrc.icu",
    notes: "Legacy anime-capable source",
    animeIdType: "anilist",
    getMovieUrl: (id) => `https://vidsrc.icu/embed/movie/${id}`,
    getTVUrl: (id, season, episode) => `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`,
    getAnimeTVUrl: (aniListId, _season, episode) =>
      `https://vidsrc.icu/embed/anime/${aniListId}/${episode}/1`
  },
  {
    key: "2embed",
    name: "2Embed",
    category: "fallback",
    idType: "imdb",
    quality: "720p",
    website: "https://www.2embed.cc",
    notes: "IMDb-only fallback",
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

export function getProviderCapabilities(provider: ProviderCatalogEntry): string[] {
  const capabilities = [provider.quality];

  if (provider.idType === "both") capabilities.push("TMDB/IMDb");
  else capabilities.push(provider.idType.toUpperCase());

  if (provider.getAnimeTVUrl) capabilities.push("Anime");
  if (provider.progress?.resumeParam) capabilities.push("Resume");
  if (provider.notes) capabilities.push(provider.notes);

  return capabilities;
}

export function getGroupedProviders(providers: ProviderCatalogEntry[] = STREAM_PROVIDERS) {
  const groups: Array<{ key: ProviderCategory; label: string; providers: ProviderCatalogEntry[] }> =
    [
      { key: "primary", label: "Primary Sources", providers: [] },
      { key: "anime", label: "Anime Friendly", providers: [] },
      { key: "fallback", label: "Fallback Sources", providers: [] }
    ];

  for (const provider of providers) {
    groups.find((group) => group.key === provider.category)?.providers.push(provider);
  }

  return groups.filter((group) => group.providers.length > 0);
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
