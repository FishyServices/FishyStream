import { resolveAniListEpisodeAddress } from "./anilistResolver";
import { mapCanonicalToProviderOrder } from "./tvSeasonMappings";
import type { AniListEpisodeMapping } from "./types";

export type ProviderKey =
  | "111movies"
  | "2embed"
  | "autoembed"
  | "cinesrc"
  | "cinezo"
  | "filmu"
  | "flickystream"
  | "lordflix"
  | "mafiaembed"
  | "megaplay"
  | "peachify"
  | "superembed"
  | "tryembed"
  | "vidcore"
  | "videasy"
  | "vidfast"
  | "vidking"
  | "vidnest"
  | "vidplays"
  | "vidplus (ads)"
  | "vidrock"
  | "vidsrc"
  | "vidsrcpro"
  | "vidup"
  | "vidzee"
  | "vidzen"
  | "vixsrc";

export type ProviderCategory = "primary" | "primary_anime" | "other";
export type ProviderIdType = "tmdb" | "imdb" | "both";
export type AnimeIdType = "same" | "anilist";
export type ProviderParamType = "boolean" | "string" | "number" | "hex" | "time";

export interface ProviderProgressConfig {
  origins: string[];
  controlApi?: boolean;
  statusRequest?: boolean;
  resumeParam?: "progress" | "startAt";
  unsafeWildcardOrigin?: boolean;
  referrerPolicy?:
    | "no-referrer"
    | "unsafe-url"
    | "origin"
    | "origin-when-cross-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin";
}

export interface ProviderCatalogEntry<TParams extends Record<string, ProviderParamType> = any> {
  key: ProviderKey;
  name: string;
  category: ProviderCategory;
  idType: ProviderIdType;
  website?: string;
  animeOnly?: boolean;
  animeIdType?: AnimeIdType;
  dubSupport?: boolean;
  progress?: ProviderProgressConfig;
  params?: TParams;
  getMovieUrl: (id: string, params?: Partial<{ [K in keyof TParams]: any }>) => string;
  getTVUrl: (
    id: string,
    season: number,
    episode: number,
    params?: Partial<{ [K in keyof TParams]: any }>
  ) => string;
  getAnimeTVUrl?: (
    id: string,
    season: number,
    episode: number,
    dub?: boolean,
    params?: Partial<{ [K in keyof TParams]: any }>
  ) => string;
}

export interface StreamSource {
  key: string;
  name: string;
  url: string;
}

type ProviderDefinition<TParams extends Record<string, ProviderParamType>> = Omit<
  ProviderCatalogEntry<TParams>,
  "getMovieUrl" | "getTVUrl" | "getAnimeTVUrl"
> & {
  moviePath: (id: string) => string;
  tvPath: (id: string, season: number, episode: number) => string;
  animePath?: (id: string, season: number, episode: number, dub?: boolean) => string;
};

const ALL_ORIGINS = ["*"];

function providerOriginFromWebsite(website?: string) {
  if (!website?.startsWith("http://") && !website?.startsWith("https://")) return undefined;
  try {
    return new URL(website).origin;
  } catch {
    return undefined;
  }
}

function defineProvider<TParams extends Record<string, ProviderParamType>>(
  definition: ProviderDefinition<TParams>
): ProviderCatalogEntry<TParams> {
  const { moviePath, tvPath, animePath, website, params, ...rest } = definition;
  const baseUrl = website?.replace(/\/+$/, "");
  const origin = providerOriginFromWebsite(website);
  const progress = rest.progress
    ? {
        ...rest.progress,
        origins:
          rest.progress.origins.length === 1 && rest.progress.origins[0] === "*" && origin
            ? [origin]
            : rest.progress.origins,
        unsafeWildcardOrigin:
          rest.progress.unsafeWildcardOrigin ??
          (rest.progress.origins.length === 1 && rest.progress.origins[0] === "*" && !origin)
      }
    : undefined;

  const resolveUrl = (path: string, urlParams?: Record<string, any>) => {
    let url = path;
    if (
      baseUrl &&
      !path.startsWith("/api/") &&
      !path.startsWith("http://") &&
      !path.startsWith("https://")
    ) {
      url = `${baseUrl}${path}`;
    }

    if (urlParams && Object.keys(urlParams).length > 0) {
      try {
        const urlObj = new URL(url, url.startsWith("http") ? undefined : "http://localhost");
        for (const [key, value] of Object.entries(urlParams)) {
          if (value !== undefined && value !== null && value !== "") {
            urlObj.searchParams.set(key, String(value));
          }
        }
        url = url.startsWith("http") ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;
      } catch {}
    }

    return url;
  };

  return {
    ...rest,
    params,
    progress,
    website,
    getMovieUrl: (id, p) => resolveUrl(moviePath(id), p),
    getTVUrl: (id, season, episode, p) => resolveUrl(tvPath(id, season, episode), p),
    getAnimeTVUrl: animePath
      ? (id, season, episode, dub, p) => resolveUrl(animePath(id, season, episode, dub), p)
      : undefined
  };
}

export const STREAM_PROVIDERS: ProviderCatalogEntry[] = [
  // ── Primary ──────────────────────────────────────────────────────────────
  defineProvider({
    key: "peachify",
    name: "Peachify",
    category: "primary",
    idType: "tmdb",
    website: "https://peachify.top",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    params: {
      server: "string",
      dub: "string",
      sub: "string",
      startAt: "time",
      autoNext: "number",
      showNextBtn: "boolean",
      autoPlay: "boolean",
      pip: "string",
      cast: "string",
      fullscreen: "string",
      volume: "string",
      servers: "string",
      captions: "string",
      quality: "string"
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidcore",
    name: "VidCore",
    category: "primary",
    idType: "both",
    website: "https://vidcore.net",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    params: {
      title: "boolean",
      poster: "boolean",
      autoPlay: "boolean",
      startAt: "time",
      theme: "hex",
      nextButton: "boolean",
      autoNext: "boolean",
      server: "string",
      hideServer: "boolean",
      fullscreenButton: "boolean",
      chromecast: "boolean",
      sub: "string"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidking",
    name: "VidKing",
    category: "primary",
    idType: "tmdb",
    website: "https://www.vidking.net",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    params: {
      color: "hex",
      autoPlay: "boolean",
      nextEpisode: "boolean",
      episodeSelector: "boolean",
      progress: "time"
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidzen",
    name: "VidZen",
    category: "primary",
    idType: "tmdb",
    website: "https://vidzen.fun",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),

  // ── Primary Anime ─────────────────────────────────────────────────────────
  defineProvider({
    key: "filmu",
    name: "filmu",
    category: "primary_anime",
    idType: "both",
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
    key: "tryembed",
    name: "TryEmbed",
    category: "primary_anime",
    idType: "tmdb",
    website: "https://tryembed.us.cc",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    params: {
      autoplay: "boolean",
      autoSkip: "boolean",
      autoNext: "boolean",
      "lang-type": "boolean",
      startAt: "time",
      opensubs: "string"
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/embed/anime/${id}/${episode}/${dub ? "dub" : "sub"}`
  }),
  defineProvider({
    key: "vidfast",
    name: "VidFast",
    category: "primary_anime",
    idType: "both",
    website: "https://vidfast.pro",
    progress: {
      origins: ALL_ORIGINS,
      resumeParam: "startAt",
      referrerPolicy: "no-referrer"
    },
    params: {
      title: "boolean",
      poster: "boolean",
      autoPlay: "boolean",
      startAt: "time",
      theme: "hex",
      server: "string",
      hideServer: "boolean",
      fullscreenButton: "boolean",
      chromecast: "boolean",
      sub: "string",
      nextButton: "boolean",
      autoNext: "boolean"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),

  // ── Other ─────────────────────────────────────────────────────────────────
  defineProvider({
    key: "111movies",
    name: "111movies",
    category: "other",
    idType: "both",
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
    website: "https://cinesrc.st",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    params: {
      seek: "number",
      autoplay: "boolean",
      muted: "boolean",
      color: "hex",
      controls: "boolean",
      back: "string",
      autonext: "boolean",
      autoskip: "boolean",
      prioritize: "boolean",
      lastserver: "string",
      t: "time",
      continueprompt: "boolean",
      quality: "string",
      febbox: "string"
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}?s=${season}&e=${episode}`
  }),
  defineProvider({
    key: "cinezo",
    name: "Cinezo",
    category: "other",
    idType: "tmdb",
    website: "https://player.cinezo.live",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt" },
    params: {
      primarycolor: "hex",
      secondarycolor: "hex",
      iconcolor: "hex",
      autoplay: "boolean",
      poster: "boolean",
      chromecast: "boolean",
      servericon: "boolean",
      setting: "boolean",
      pip: "boolean",
      font: "string",
      fontcolor: "hex",
      fontsize: "number",
      opacity: "number",
      logourl: "string",
      server: "string"
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    key: "flickystream",
    name: "FlickyStream",
    category: "other",
    idType: "tmdb",
    website: "https://flickystream.su",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/player/movie/${id}`,
    tvPath: (id, season, episode) => `/player/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "lordflix",
    name: "LordFlix",
    category: "other",
    idType: "tmdb",
    website: "https://lordflix.org",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    moviePath: (id) => `/watch/movie/${id}`,
    tvPath: (id, season, episode) => `/watch/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "mafiaembed",
    name: "MafiaEmbed",
    category: "other",
    idType: "tmdb",
    website: "https://nhdapi.com",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    params: {
      autoplay: "boolean",
      autonext: "boolean",
      progress: "time",
      audio: "boolean",
      title: "boolean",
      download: "boolean",
      setting: "boolean",
      episodelist: "boolean",
      chromecast: "boolean",
      pip: "boolean",
      watchparty: "boolean",
      nextbutton: "boolean",
      hidecontrols: "boolean",
      primarycolor: "hex",
      secondarycolor: "hex",
      iconcolor: "hex",
      glasscolor: "hex",
      glassopacity: "number",
      glassblur: "number",
      icons: "string",
      iconsize: "number",
      font: "string",
      fontcolor: "hex",
      fontsize: "number",
      subtitle: "string",
      subdelay: "number",
      subtextsize: "number",
      subtextcolor: "hex",
      subcapitalize: "boolean",
      subbold: "boolean",
      subfont: "string",
      subbgenabled: "boolean",
      subbgcolor: "hex",
      subbgopacity: "number",
      subbgblur: "number",
      opacity: "number",
      logo: "string",
      logowidth: "string",
      logoheight: "string",
      hideautoplay: "boolean",
      hideautonext: "boolean",
      hidenextbutton: "boolean",
      hidetitle: "boolean",
      hidechromecast: "boolean",
      hidepip: "boolean",
      hideepisodelist: "boolean",
      hideprogress: "boolean",
      hidelanguage: "boolean",
      hideprimarycolor: "boolean",
      hidesecondarycolor: "boolean",
      hideiconcolor: "boolean",
      appearance: "string",
      hidequality: "boolean",
      hideserver: "boolean",
      hidesubtitlemenu: "boolean",
      hidesubtitlestyle: "boolean",
      hideplaybackspeed: "boolean",
      hideupscaler: "boolean",
      hidevideosize: "boolean",
      hideservericon: "boolean",
      hideskip: "boolean",
      hideposter: "boolean",
      suboutline: "number",
      subshadow: "number",
      language: "number",
      lang: "string",
      server: "number"
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "superembed",
    name: "SuperEmbed",
    category: "other",
    idType: "tmdb",
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
    website: "https://player.videasy.net",
    animeIdType: "anilist",
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    params: {
      color: "hex",
      progress: "time",
      nextEpisode: "boolean",
      episodeSelector: "boolean",
      autoplayNextEpisode: "boolean",
      overlay: "boolean"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode) => `/anime/${id}/${episode}`
  }),
  defineProvider({
    key: "vidnest",
    name: "VidNest",
    category: "other",
    idType: "tmdb",
    website: "https://vidnest.fun",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, resumeParam: "progress", referrerPolicy: "no-referrer" },
    params: {
      startAt: "time",
      progress: "time",
      server: "string",
      servericon: "string",
      topcaption: "string",
      topsettings: "string",
      centerseekbackward: "string",
      centerplay: "string",
      centerseekforward: "string",
      timeslider: "string",
      mute: "string",
      volume: "string",
      timegroup: "string",
      bottomcaption: "string",
      bottomsettings: "string",
      pip: "string",
      cast: "string",
      fullscreen: "string",
      prevepisode: "string",
      nextepisode: "string"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/anime/${id}/${episode}${dub ? "/dub" : "/sub"}` // AnimePahe
  }),
  defineProvider({
    key: "vidplays",
    name: "VidPlays",
    category: "other",
    idType: "tmdb",
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
    website: "https://vidrock.ru",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { origins: ALL_ORIGINS, referrerPolicy: "strict-origin-when-cross-origin" },
    params: {
      autoplay: "boolean",
      autonext: "boolean",
      theme: "hex",
      download: "boolean",
      nextbutton: "boolean",
      episodeselector: "boolean",
      lang: "string"
    },
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
    website: "https://vidup.to",
    progress: { origins: ALL_ORIGINS, referrerPolicy: "no-referrer" },
    params: {
      title: "boolean",
      poster: "boolean",
      autoPlay: "boolean",
      startAt: "time",
      theme: "hex",
      server: "string",
      hideServer: "boolean",
      fullscreenButton: "boolean",
      chromecast: "boolean",
      sub: "string",
      nextButton: "boolean",
      autoNext: "boolean"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidzee",
    name: "VidZee",
    category: "other",
    idType: "tmdb",
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
    website: "https://vixsrc.to",
    progress: { origins: ALL_ORIGINS, resumeParam: "startAt", referrerPolicy: "no-referrer" },
    params: {
      primaryColor: "hex",
      secondaryColor: "hex",
      autoplay: "boolean",
      startAt: "time",
      lang: "string"
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  })
];

export function getProviderByKey(key: string): ProviderCatalogEntry | undefined {
  return STREAM_PROVIDERS.find((provider) => provider.key === key);
}

export function getProviderCapabilities(provider: ProviderCatalogEntry): string[] {
  const capabilities = [];

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
    return (
      !!origins &&
      (origins.includes(origin) ||
        (origins.includes("*") && provider.progress?.unsafeWildcardOrigin !== true))
    );
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
        url: provider.getMovieUrl(id)
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
      url
    });
  }

  return dedupeSources(sources);
}
