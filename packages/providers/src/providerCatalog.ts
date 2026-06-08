import { resolveAniListEpisodeAddress } from "./anilistResolver";
import { mapCanonicalToProviderOrder } from "./tvSeasonMappings";
import type { AniListEpisodeMapping } from "./types";

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
  | "vidsrcpro"
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
  | "cinesrc"
  | "vidup";

export type ProviderCategory = "primary" | "primary_anime" | "other";
export type ProviderIdType = "tmdb" | "imdb" | "both";
export type AnimeIdType = "same" | "anilist";

export interface ProviderProgressConfig {
  origins: string[];
  controlApi?: boolean;
  statusRequest?: boolean;
  resumeParam?: "progress" | "startAt";
  referrerPolicy?:
    | "no-referrer"
    | "unsafe-url"
    | "origin"
    | "origin-when-cross-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin";
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

export interface StreamSource {
  key: string;
  name: string;
  url: string;
  quality: string;
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
    if (path.startsWith("/api/")) return path;
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
    key: "peachify",
    name: "Peachify",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://peachify.top",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
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
    key: "vidking",
    name: "VidKing",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://www.vidking.net",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidzen",
    name: "VidZen",
    category: "primary",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vidzen.fun",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "filmu",
    name: "filmu",
    category: "primary_anime",
    idType: "both",
    quality: "1080p",
    website: "https://embed.filmu.in",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "megaplay",
    name: "MegaPlay",
    category: "primary_anime",
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
    key: "vidfast",
    name: "VidFast",
    category: "primary_anime",
    idType: "both",
    quality: "1080p",
    website: "https://vidfast.pro",
    progress: {
      origins: ALL_ORIGINS,
      resumeParam: "startAt",
      referrerPolicy: "no-referrer"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "tryembed",
    name: "TryEmbed",
    category: "primary_anime",
    idType: "tmdb",
    quality: "1080p",
    website: "https://tryembed.us.cc",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/embed/anime/${id}/${episode}/${dub ? "dub" : "sub"}`
  }),
  defineProvider({
    key: "111movies",
    name: "111movies",
    category: "other",
    idType: "both",
    quality: "720p",
    website: "https://111movies.net",
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "2embed",
    name: "2Embed",
    category: "other",
    idType: "imdb",
    quality: "720p",
    website: "https://www.2embed.cc",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/${id}`,
    tvPath: (id, season, episode) => `/embed/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "autoembed",
    name: "AutoEmbed",
    category: "other",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.autoembed.cc",
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "cinesrc",
    name: "cinesrc",
    category: "other",
    idType: "tmdb",
    quality: "1080p",
    website: "https://cinesrc.st",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}?s=${season}&e=${episode}`
  }),
  defineProvider({
    key: "cinezo",
    name: "Cinezo",
    category: "other",
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
    category: "other",
    idType: "tmdb",
    quality: "1080p",
    website: "https://nhdapi.com",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "superembed",
    name: "SuperEmbed",
    category: "other",
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
    key: "videasy",
    name: "VidEasy",
    category: "other",
    idType: "tmdb",
    quality: "1080p",
    website: "https://player.videasy.net",
    animeIdType: "anilist",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode) => `/anime/${id}/${episode}`
  }),
  defineProvider({
    key: "vidnest",
    name: "VidNest",
    category: "other",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vidnest.fun",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/anime/${id}/${episode}${dub ? "/dub" : "/sub"}`
  }),
  defineProvider({
    key: "vidplays",
    name: "VidPlays",
    category: "other",
    idType: "tmdb",
    quality: "1080p",
    website: "/vidplays-proxy",
    progress: {
      origins: ALL_ORIGINS,
      resumeParam: "startAt",
      referrerPolicy: "unsafe-url"
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidplus (ads)",
    name: "VidPlus (Ads)",
    category: "other",
    idType: "both",
    quality: "1080p",
    website: "https://player.vidplus.to",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "vidrock",
    name: "VidRock",
    category: "other",
    idType: "both",
    quality: "1080p",
    website: "https://vidrock.ru",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, referrerPolicy: "strict-origin-when-cross-origin" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "vidsrc",
    name: "VidSrc",
    category: "other",
    idType: "both",
    quality: "1080p",
    website: "https://vidsrc.to",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/embed/anime/${id}/${episode}/${dub ? "2" : "1"}`
  }),
  defineProvider({
    key: "vidsrcpro",
    name: "VidSrc Pro",
    category: "other",
    idType: "both",
    quality: "1080p",
    website: "https://vidsrc.mov",
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidup",
    name: "VidUp",
    category: "other",
    idType: "tmdb",
    quality: "720p",
    website: "https://vidup.to",
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidzee",
    name: "VidZee",
    category: "other",
    idType: "tmdb",
    quality: "720p",
    website: "https://player.vidzee.wtf",
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    moviePath: (id) => `/v2/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/v2/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vixsrc",
    name: "VixSrc",
    category: "other",
    idType: "tmdb",
    quality: "1080p",
    website: "https://vixsrc.to",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
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
    ["primary_anime", []],
    ["other", []]
  ]);

  for (const provider of providers) {
    grouped.get(provider.category)?.push(provider);
  }

  return [
    { key: "primary" as const, label: "Primary", providers: grouped.get("primary") ?? [] },
    {
      key: "primary_anime" as const,
      label: "Primary Anime",
      providers: grouped.get("primary_anime") ?? []
    },
    {
      key: "other" as const,
      label: "Other Sources",
      providers: grouped.get("other") ?? []
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

function dedupeSources(sources: StreamSource[]) {
  const seen = new Set<string>();
  const result: StreamSource[] = [];

  for (const source of sources) {
    const key = `${source.key}:${source.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }

  return result;
}

export function buildMovieSources(args: { imdbId?: string; tmdbId?: string }): StreamSource[] {
  const { imdbId, tmdbId } = args;
  const sources = STREAM_PROVIDERS.flatMap((provider) => {
    if (provider.animeOnly) return [];

    const id = getProviderId(provider, imdbId, tmdbId);
    if (!id) return [];

    return [
      {
        key: provider.key,
        name: provider.name,
        url: provider.getMovieUrl(id),
        quality: provider.quality
      }
    ];
  });

  return dedupeSources(sources);
}

export async function buildTvSources(args: {
  imdbId?: string;
  isAnime?: boolean;
  season: number;
  episode: number;
  title?: string;
  seasonTitle?: string;
  year?: number;
  tmdbId?: string;
  anilistId?: string;
  anilistEpisodeMappings?: AniListEpisodeMapping[];
  dub?: boolean;
}): Promise<StreamSource[]> {
  const {
    imdbId,
    tmdbId,
    anilistId,
    anilistEpisodeMappings,
    season,
    episode,
    isAnime,
    title,
    seasonTitle,
    year,
    dub
  } = args;
  let resolvedAniListAddress: Awaited<ReturnType<typeof resolveAniListEpisodeAddress>> | undefined =
    undefined;
  const storedAniListAddress = anilistEpisodeMappings?.find(
    (mapping) => mapping.episodeNumber === episode
  );

  const sources: StreamSource[] = [];
  for (const provider of STREAM_PROVIDERS) {
    if (provider.animeOnly && !isAnime) continue;

    const fallbackId = getProviderId(provider, imdbId, tmdbId);
    let animeId = fallbackId;

    if (isAnime && provider.getAnimeTVUrl && provider.animeIdType === "anilist") {
      if (resolvedAniListAddress === undefined) {
        resolvedAniListAddress = storedAniListAddress
          ? {
              anilistId: storedAniListAddress.anilistId,
              episode: storedAniListAddress.anilistEpisodeNumber
            }
          : await resolveAniListEpisodeAddress({
              anilistId,
              title,
              season,
              seasonTitle,
              year,
              episode
            });
      }
      animeId = resolvedAniListAddress?.anilistId ?? null;
    }

    const id = animeId ?? fallbackId;
    if (!id) continue;

    const mapped =
      isAnime && provider.getAnimeTVUrl && animeId
        ? { season, episode: resolvedAniListAddress?.episode ?? episode }
        : mapCanonicalToProviderOrder(tmdbId, provider.name, { season, episode });
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

  return dedupeSources(sources);
}
