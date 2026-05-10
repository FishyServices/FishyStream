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
  | "2embed"
  | "vidzee"
  | "111movies"
  | "vidplays"
  | "tryembed"
  | "vidcore"
  | "megaplay"
  | "peachify"
  | "cinesrc";

export type ProviderCategory = "primary" | "anime" | "fallback";
export type ProviderIdType = "tmdb" | "imdb" | "both";
export type AnimeIdType = "same" | "anilist";

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
  idType: ProviderIdType;
  quality: string;
  website?: string;
  animeOnly?: boolean;
  animeIdType?: AnimeIdType;
  dubSupport?: boolean;
  progress?: ProviderProgressConfig;
  getMovieUrl: (id: string) => string;
  getTVUrl: (id: string, season: number, episode: number) => string;
  getAnimeTVUrl?: (id: string, season: number, episode: number, dub?: boolean) => string;
}

type ProviderDefinition = Omit<
  ProviderCatalogEntry,
  "getMovieUrl" | "getTVUrl" | "getAnimeTVUrl"
> & {
  moviePath: (id: string) => string;
  tvPath: (id: string, season: number, episode: number) => string;
  animePath?: (id: string, season: number, episode: number, dub?: boolean) => string;
};

const ALL_ORIGINS = ["*"];

function defineProvider(definition: ProviderDefinition): ProviderCatalogEntry {
  const { moviePath, tvPath, animePath, website, ...rest } = definition;
  const baseUrl = website?.replace(/\/+$/, "");

  const resolveUrl = (path: string) => {
    if (!baseUrl) return path;
    return path.startsWith("http://") || path.startsWith("https://") ? path : `${baseUrl}${path}`;
  };

  return {
    ...rest,
    website,
    getMovieUrl: (id) => resolveUrl(moviePath(id)),
    getTVUrl: (id, season, episode) => resolveUrl(tvPath(id, season, episode)),
    getAnimeTVUrl: animePath
      ? (id, season, episode, dub) => resolveUrl(animePath(id, season, episode, dub))
      : undefined
  };
}

export const STREAM_PROVIDERS: ProviderCatalogEntry[] = [
  defineProvider({
    key: "vidking",
    name: "VidKing",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://www.vidking.net",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidfast",
    name: "VidFast",
    category: "primary",
    idType: "both",
    quality: "1080p",
    website: "https://vidfast.pro",
    progress: {
      origins: ALL_ORIGINS,
      controlApi: true,
      statusRequest: true,
      resumeParam: "startAt"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "videasy",
    name: "VidEasy",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.videasy.net",
    animeIdType: "anilist",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode) => `/anime/${id}/${episode}`
  }),
  defineProvider({
    key: "vidnest",
    name: "VidNest",
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vidnest.fun",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "progress" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/anime/${id}/${episode}${dub ? "/dub" : "/sub"}`
  }),
  defineProvider({
    key: "vidrock",
    name: "VidRock",
    category: "anime",
    idType: "both",
    quality: "1080p",
    website: "https://vidrock.ru",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "vidplus (ads)",
    name: "VidPlus (Ads)",
    category: "fallback",
    idType: "both",
    quality: "1080p",
    website: "https://player.vidplus.to",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "filmu",
    name: "filmu",
    category: "anime",
    idType: "both",
    quality: "1080p",
    website: "https://embed.filmu.in",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "vidzen",
    name: "VidZen",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vidzen.fun",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vixsrc",
    name: "VixSrc",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vixsrc.to",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidsrc pro",
    name: "VidSrc Pro",
    category: "primary",
    idType: "both",
    quality: "1080p",
    website: "https://vidsrc.mov",
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "cinezo",
    name: "Cinezo",
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.cinezo.live",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "mafiaembed",
    name: "MafiaEmbed",
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://embed.streammafia.to",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "progress" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "superembed",
    name: "SuperEmbed",
    category: "fallback",
    idType: "tmdb",
    quality: "1080p",
    website: "https://www.multiembed.mov",
    animeIdType: "anilist",
    dubSupport: true,
    moviePath: (id) => `/?video_id=${id}&tmdb=1`,
    tvPath: (id, season, episode) => `/?video_id=${id}&tmdb=1&season=${season}&episode=${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/?video_id=${id}&anime=1&episode=${episode}${dub ? "&dub=1" : ""}`
  }),
  defineProvider({
    key: "autoembed",
    name: "AutoEmbed",
    category: "fallback",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.autoembed.cc",
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidsrc",
    name: "VidSrc",
    category: "anime",
    idType: "both",
    quality: "1080p",
    website: "https://vidsrc.icu",
    animeIdType: "anilist",
    dubSupport: true,
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/embed/anime/${id}/${episode}/${dub ? "2" : "1"}`
  }),
  defineProvider({
    key: "2embed",
    name: "2Embed",
    category: "fallback",
    idType: "imdb",
    quality: "720p",
    website: "https://www.2embed.cc",
    animeIdType: "anilist",
    dubSupport: true,
    moviePath: (id) => `/embed/${id}`,
    tvPath: (id, season, episode) => `/embed/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "vidzee",
    name: "VidZee",
    category: "fallback",
    idType: "imdb",
    quality: "720p",
    website: "https://player.vidzee.wtf",
    moviePath: (id) => `/embed/${id}`,
    tvPath: (id, season, episode) => `/embed/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "111movies",
    name: "111movies",
    category: "fallback",
    idType: "imdb",
    quality: "720p",
    website: "https://111movies.net",
    moviePath: (id) => `/embed/${id}`,
    tvPath: (id, season, episode) => `/embed/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidplays",
    name: "VidPlays",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vidplays.fun",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "tryembed",
    name: "TryEmbed",
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://tryembed.us.cc",
    animeOnly: true,
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/embed/anime/${id}/${episode}/${dub ? "dub" : "sub"}`
  }),
  defineProvider({
    key: "megaplay",
    name: "MegaPlay",
    category: "anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://megaplay.buzz",
    animeOnly: true,
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/stream/ani/${id}/1/sub`,
    tvPath: (id, _season, episode) => `/stream/ani/${id}/${episode}/sub`,
    animePath: (id, _season, episode, dub) => `/stream/ani/${id}/${episode}/${dub ? "dub" : "sub"}`
  }),
  defineProvider({
    key: "vidcore",
    name: "VidCore",
    category: "primary",
    idType: "both",
    quality: "4K",
    website: "https://vidcore.net",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "peachify",
    name: "Peachify",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://peachify.top",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "cinesrc",
    name: "cinesrc",
    category: "fallback",
    idType: "tmdb",
    quality: "1080p",
    website: "https://cinesrc.st",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}?s=${season}&e=${episode}`
  })
];

export function getProviderByKey(key: string): ProviderCatalogEntry | undefined {
  return STREAM_PROVIDERS.find((provider) => provider.key === key);
}

export function getProviderCapabilities(provider: ProviderCatalogEntry): string[] {
  const capabilities = [provider.quality];

  if (provider.idType === "both") capabilities.push("TMDB/IMDb");
  else capabilities.push(provider.idType.toUpperCase());

  if (provider.getAnimeTVUrl) capabilities.push("Anime");
  if (provider.dubSupport) capabilities.push("Sub/Dub");
  if (provider.progress?.resumeParam) capabilities.push("Resume");

  return capabilities;
}

export function getGroupedProviders(providers: ProviderCatalogEntry[] = STREAM_PROVIDERS) {
  const grouped = new Map<ProviderCategory, ProviderCatalogEntry[]>([
    ["primary", []],
    ["anime", []],
    ["fallback", []]
  ]);

  for (const provider of providers) {
    grouped.get(provider.category)?.push(provider);
  }

  return [
    { key: "primary" as const, label: "Primary Sources", providers: grouped.get("primary") ?? [] },
    { key: "anime" as const, label: "Anime Friendly", providers: grouped.get("anime") ?? [] },
    {
      key: "fallback" as const,
      label: "Fallback Sources",
      providers: grouped.get("fallback") ?? []
    }
  ].filter((group) => group.providers.length > 0);
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
