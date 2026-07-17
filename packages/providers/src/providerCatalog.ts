import { resolveAniListEpisodeAddress } from "./anilistResolver";
import { mapCanonicalToProviderOrder, getTvOrderingOverride } from "./tvSeasonMappings";
import type { AniListEpisodeMapping } from "./types";

export type ProviderKey =
  | "111movies"
  | "2embed"
  | "autoembed"
  | "cinesrc"
  | "cinezo"
  | "direct" // for tvSeasonMappings.ts
  | "filmu"
  | "flickystream"
  | "mafiaembed"
  | "megaplay"
  | "peachify"
  | "superembed"
  | "tryembed"
  | "vaplayer"
  | "vidcodin"
  | "vidcore"
  | "videasy"
  | "vidfast"
  | "vidking"
  | "vidlux"
  | "vidnest"
  | "vidplays"
  | "vidplus-ads"
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

export type ProviderReferrerPolicy =
  | "no-referrer"
  | "unsafe-url"
  | "origin"
  | "origin-when-cross-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin";

export interface ProviderProgressConfig {
  resumeParam?: "progress" | "startAt";
  controlApi?: boolean;
  statusRequest?: boolean;
}

export interface ProviderParamDef {
  type: ProviderParamType;
  default?: boolean | string | number;
}

export type ProviderParamsDef = Record<string, ProviderParamDef>;

export interface ProviderCatalogEntry<TParams extends ProviderParamsDef = ProviderParamsDef> {
  key: ProviderKey;
  name: string;
  category: ProviderCategory;
  idType: ProviderIdType;
  website?: string;
  animeOnly?: boolean;
  animeIdType?: AnimeIdType;
  dubSupport?: boolean;
  origins: string[];
  referrerPolicy?: ProviderReferrerPolicy;
  unsafeWildcardOrigin?: boolean;
  progress?: ProviderProgressConfig;
  supportsCustomUI?: boolean;
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

type ProviderDefinition<TParams extends ProviderParamsDef> = Omit<
  ProviderCatalogEntry<TParams>,
  "getMovieUrl" | "getTVUrl" | "getAnimeTVUrl" | "origins" | "unsafeWildcardOrigin"
> & {
  origins?: string[];
  moviePath: (id: string) => string;
  tvPath: (id: string, season: number, episode: number) => string;
  animePath?: (id: string, season: number, episode: number, dub?: boolean) => string;
};

function providerOriginFromWebsite(website?: string) {
  if (!website?.startsWith("http://") && !website?.startsWith("https://")) return undefined;
  try {
    return new URL(website).origin;
  } catch {
    return undefined;
  }
}

function defineProvider<TParams extends ProviderParamsDef>(
  definition: ProviderDefinition<TParams>
): ProviderCatalogEntry<TParams> {
  const {
    moviePath,
    tvPath,
    animePath,
    website,
    params,
    origins: rawOrigins,
    ...rest
  } = definition;
  const baseUrl = website?.replace(/\/+$/, "");
  const origin = providerOriginFromWebsite(website);

  const resolvedOrigins = rawOrigins ?? ["*"];
  const resolvedUnsafeWildcard =
    resolvedOrigins.length === 1 && resolvedOrigins[0] === "*" && !origin;
  const finalOrigins =
    resolvedOrigins.length === 1 && resolvedOrigins[0] === "*" && origin
      ? [origin]
      : resolvedOrigins;

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
    website,
    origins: finalOrigins,
    unsafeWildcardOrigin: resolvedUnsafeWildcard,
    getMovieUrl: (id, p) => resolveUrl(moviePath(id), p),
    getTVUrl: (id, season, episode, p) => resolveUrl(tvPath(id, season, episode), p),
    getAnimeTVUrl: animePath
      ? (id, season, episode, dub, p) => resolveUrl(animePath(id, season, episode, dub), p)
      : undefined
  };
}

const STANDARD_EMBED_PLAYER_PARAMS: ProviderParamsDef = {
  title: { type: "boolean", default: true },
  poster: { type: "boolean", default: true },
  autoPlay: { type: "boolean", default: false },
  startAt: { type: "time" },
  theme: { type: "hex" },
  server: { type: "string" },
  hideServer: { type: "boolean", default: false },
  fullscreenButton: { type: "boolean", default: true },
  chromecast: { type: "boolean", default: true },
  sub: { type: "string" },
  nextButton: { type: "boolean", default: true },
  autoNext: { type: "boolean", default: false }
};

export const STREAM_PROVIDERS: ProviderCatalogEntry[] = [
  defineProvider({
    key: "111movies",
    name: "111movies",
    category: "other",
    idType: "both",
    website: "https://111movies.net",
    referrerPolicy: "no-referrer",
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
    referrerPolicy: "no-referrer",
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
    referrerPolicy: "no-referrer",
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "cinesrc",
    name: "CineSrc",
    category: "other",
    idType: "tmdb",
    website: "https://cinesrc.st",
    progress: { resumeParam: "startAt" },
    params: {
      seek: { type: "number" },
      autoplay: { type: "boolean", default: true },
      muted: { type: "boolean", default: false },
      color: { type: "hex" },
      controls: { type: "boolean", default: true },
      back: { type: "string" },
      autonext: { type: "boolean", default: false },
      autoskip: { type: "boolean", default: false },
      prioritize: { type: "boolean", default: false },
      lastserver: { type: "string" },
      t: { type: "time" },
      continueprompt: { type: "boolean", default: true },
      quality: { type: "string" },
      febbox: { type: "string" }
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
    progress: { resumeParam: "startAt" },
    params: {
      primarycolor: { type: "hex" },
      secondarycolor: { type: "hex" },
      iconcolor: { type: "hex" },
      autoplay: { type: "boolean", default: true },
      poster: { type: "boolean", default: true },
      chromecast: { type: "boolean", default: true },
      servericon: { type: "boolean", default: true },
      setting: { type: "boolean", default: true },
      pip: { type: "boolean", default: true },
      font: { type: "string" },
      fontcolor: { type: "hex" },
      fontsize: { type: "number" },
      opacity: { type: "number" },
      logourl: { type: "string" },
      server: { type: "string" }
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) =>
      `/embed/anime/${id}/${episode}${dub ? "?dub=true" : ""}`
  }),
  defineProvider({
    // for tvSeasonMappings.ts
    key: "direct",
    name: "Direct",
    category: "other",
    idType: "tmdb",
    website: "",
    moviePath: () => "",
    tvPath: () => ""
  }),
  defineProvider({
    key: "filmu",
    name: "Filmu",
    category: "primary_anime",
    idType: "both",
    website: "https://embed.filmu.in",
    animeIdType: "anilist",
    dubSupport: true,
    referrerPolicy: "no-referrer",
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
    progress: { resumeParam: "progress" },
    referrerPolicy: "no-referrer",
    moviePath: (id) => `/player/movie/${id}`,
    tvPath: (id, season, episode) => `/player/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "mafiaembed",
    name: "MafiaEmbed",
    category: "other",
    idType: "tmdb",
    website: "https://nhdapi.com",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { resumeParam: "progress" },
    referrerPolicy: "no-referrer",
    params: {
      autoplay: { type: "boolean", default: true },
      autonext: { type: "boolean", default: false },
      progress: { type: "time" },
      audio: { type: "boolean", default: true },
      title: { type: "boolean", default: true },
      download: { type: "boolean", default: true },
      setting: { type: "boolean", default: true },
      episodelist: { type: "boolean", default: true },
      chromecast: { type: "boolean", default: true },
      pip: { type: "boolean", default: true },
      watchparty: { type: "boolean", default: false },
      nextbutton: { type: "boolean", default: true },
      hidecontrols: { type: "boolean", default: false },
      primarycolor: { type: "hex" },
      secondarycolor: { type: "hex" },
      iconcolor: { type: "hex" },
      glasscolor: { type: "hex" },
      glassopacity: { type: "number" },
      glassblur: { type: "number" },
      icons: { type: "string" },
      iconsize: { type: "number" },
      font: { type: "string" },
      fontcolor: { type: "hex" },
      fontsize: { type: "number" },
      subtitle: { type: "string" },
      subdelay: { type: "number", default: 0 },
      subtextsize: { type: "number" },
      subtextcolor: { type: "hex" },
      subcapitalize: { type: "boolean", default: false },
      subbold: { type: "boolean", default: false },
      subfont: { type: "string" },
      subbgenabled: { type: "boolean", default: false },
      subbgcolor: { type: "hex" },
      subbgopacity: { type: "number" },
      subbgblur: { type: "number" },
      opacity: { type: "number" },
      logo: { type: "string" },
      logowidth: { type: "string" },
      logoheight: { type: "string" },
      hideautoplay: { type: "boolean", default: false },
      hideautonext: { type: "boolean", default: false },
      hidenextbutton: { type: "boolean", default: false },
      hidetitle: { type: "boolean", default: false },
      hidechromecast: { type: "boolean", default: false },
      hidepip: { type: "boolean", default: false },
      hideepisodelist: { type: "boolean", default: false },
      hideprogress: { type: "boolean", default: false },
      hidelanguage: { type: "boolean", default: false },
      hideprimarycolor: { type: "boolean", default: false },
      hidesecondarycolor: { type: "boolean", default: false },
      hideiconcolor: { type: "boolean", default: false },
      appearance: { type: "string" },
      hidequality: { type: "boolean", default: false },
      hideserver: { type: "boolean", default: false },
      hidesubtitlemenu: { type: "boolean", default: false },
      hidesubtitlestyle: { type: "boolean", default: false },
      hideplaybackspeed: { type: "boolean", default: false },
      hideupscaler: { type: "boolean", default: false },
      hidevideosize: { type: "boolean", default: false },
      hideservericon: { type: "boolean", default: false },
      hideskip: { type: "boolean", default: false },
      hideposter: { type: "boolean", default: false },
      suboutline: { type: "number" },
      subshadow: { type: "number" },
      language: { type: "number" },
      lang: { type: "string" },
      server: { type: "number" }
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
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
    progress: { resumeParam: "startAt" },
    supportsCustomUI: true,
    moviePath: (id) => `/stream/ani/${id}/1/sub`,
    tvPath: (id, _season, episode) => `/stream/ani/${id}/${episode}/sub`,
    animePath: (id, _season, episode, dub) => `/stream/ani/${id}/${episode}/${dub ? "dub" : "sub"}`
  }),
  defineProvider({
    key: "peachify",
    name: "Peachify",
    category: "primary",
    idType: "tmdb",
    website: "https://peachify.top",
    progress: { resumeParam: "startAt" },
    referrerPolicy: "no-referrer",
    params: {
      server: { type: "string" },
      dub: { type: "string" },
      sub: { type: "string" },
      startAt: { type: "time" },
      autoNext: { type: "number", default: 1 },
      showNextBtn: { type: "boolean", default: true },
      autoPlay: { type: "boolean", default: true },
      pip: { type: "string" },
      cast: { type: "string" },
      fullscreen: { type: "string" },
      volume: { type: "string" },
      servers: { type: "string" },
      captions: { type: "string" },
      quality: { type: "string" }
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
    key: "tryembed",
    name: "TryEmbed",
    category: "primary_anime",
    idType: "tmdb",
    website: "https://tryembed.us.cc",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { resumeParam: "startAt" },
    referrerPolicy: "no-referrer",
    params: {
      autoplay: { type: "boolean", default: true },
      autoSkip: { type: "boolean", default: false },
      autoNext: { type: "boolean", default: false },
      "lang-type": { type: "boolean", default: false },
      startAt: { type: "time" },
      opensubs: { type: "string" }
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/embed/anime/${id}/${episode}/${dub ? "dub" : "sub"}`
  }),
  defineProvider({
    key: "vaplayer",
    name: "Vaplayer",
    category: "other",
    idType: "both",
    website: "https://vaplayer.ru",
    params: {
      primaryColor: { type: "hex" },
      color: { type: "hex" },
      title: { type: "string" },
      poster: { type: "string" },
      showTitle: { type: "boolean", default: true },
      autoplay: { type: "number", default: 0 },
      startAt: { type: "time" },
      resumeAt: { type: "time" },
      sub_url: { type: "string" },
      sub_file: { type: "string" },
      sub_label: { type: "string" },
      sub_lang: { type: "string" },
      sub_default: { type: "boolean", default: false },
      ds_lang: { type: "string" },
      lang: { type: "string" },
      controls: { type: "boolean", default: true },
      overlay: { type: "boolean", default: true },
      thumbnails: { type: "string" }
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidcodin",
    name: "VidCodin",
    category: "other",
    idType: "tmdb",
    website: "https://vidcodin.net",
    referrerPolicy: "no-referrer",
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidcore",
    name: "VidCore",
    category: "primary",
    idType: "both",
    website: "https://vidcore.net",
    progress: { resumeParam: "startAt" },
    params: STANDARD_EMBED_PLAYER_PARAMS,
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "videasy",
    name: "VidEasy",
    category: "other",
    idType: "tmdb",
    website: "https://player.videasy.net",
    animeIdType: "anilist",
    progress: { resumeParam: "progress" },
    referrerPolicy: "no-referrer",
    params: {
      color: { type: "hex" },
      progress: { type: "time" },
      nextEpisode: { type: "boolean", default: false },
      episodeSelector: { type: "boolean", default: false },
      autoplayNextEpisode: { type: "boolean", default: false },
      overlay: { type: "boolean", default: true }
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode) => `/anime/${id}/${episode}`
  }),
  defineProvider({
    key: "vidfast",
    name: "VidFast",
    category: "other",
    idType: "both",
    website: "https://vidfast.pro",
    progress: { resumeParam: "startAt" },
    referrerPolicy: "no-referrer",
    params: STANDARD_EMBED_PLAYER_PARAMS,
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidking",
    name: "VidKing",
    category: "primary",
    idType: "tmdb",
    website: "https://www.vidking.net",
    progress: { resumeParam: "progress" },
    referrerPolicy: "no-referrer",
    params: {
      color: { type: "hex", default: "e50914" },
      autoPlay: { type: "boolean", default: false },
      nextEpisode: { type: "boolean", default: false },
      episodeSelector: { type: "boolean", default: false },
      progress: { type: "time" }
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidlux",
    name: "VidLux",
    category: "other",
    idType: "tmdb",
    website: "https://vidlux.xyz",
    params: {
      key: { type: "string" },
      color: { type: "hex" },
      logo: { type: "string" },
      autoplay: { type: "boolean", default: true },
      server: { type: "string", default: "star" },
      title: { type: "string" }
    },
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidnest",
    name: "VidNest",
    category: "other",
    idType: "tmdb",
    website: "https://vidnest.fun",
    animeIdType: "anilist",
    dubSupport: true,
    progress: { resumeParam: "progress" },
    referrerPolicy: "no-referrer",
    params: {
      startAt: { type: "time" },
      progress: { type: "time" },
      server: { type: "string" },
      servericon: { type: "string" },
      topcaption: { type: "string" },
      topsettings: { type: "string" },
      centerseekbackward: { type: "string" },
      centerplay: { type: "string" },
      centerseekforward: { type: "string" },
      timeslider: { type: "string" },
      mute: { type: "string" },
      volume: { type: "string" },
      timegroup: { type: "string" },
      bottomcaption: { type: "string" },
      bottomsettings: { type: "string" },
      pip: { type: "string" },
      cast: { type: "string" },
      fullscreen: { type: "string" },
      prevepisode: { type: "string" },
      nextepisode: { type: "string" }
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    animePath: (id, _season, episode, dub) => `/anime/${id}/${episode}${dub ? "/dub" : "/sub"}`
  }),
  defineProvider({
    key: "vidplays",
    name: "VidPlays",
    category: "other",
    idType: "tmdb",
    website: "/vidplays-proxy",
    progress: { resumeParam: "startAt" },
    referrerPolicy: "unsafe-url",
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidplus-ads",
    name: "VidPlus",
    category: "other",
    idType: "both",
    website: "https://player.vidplus.to",
    animeIdType: "anilist",
    dubSupport: true,
    referrerPolicy: "no-referrer",
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
    referrerPolicy: "strict-origin-when-cross-origin",
    params: {
      autoplay: { type: "boolean", default: true },
      autonext: { type: "boolean", default: false },
      theme: { type: "hex" },
      download: { type: "boolean", default: true },
      nextbutton: { type: "boolean", default: true },
      episodeselector: { type: "boolean", default: true },
      lang: { type: "string" }
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
    referrerPolicy: "no-referrer",
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
    referrerPolicy: "no-referrer",
    moviePath: (id) => `/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidup",
    name: "VidUp",
    category: "other",
    idType: "tmdb",
    website: "https://vidup.to",
    referrerPolicy: "no-referrer",
    params: STANDARD_EMBED_PLAYER_PARAMS,
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidzee",
    name: "VidZee",
    category: "other",
    idType: "tmdb",
    website: "https://player.vidzee.wtf",
    referrerPolicy: "no-referrer",
    moviePath: (id) => `/v2/embed/movie/${id}`,
    tvPath: (id, season, episode) => `/v2/embed/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vidzen",
    name: "VidZen",
    category: "primary",
    idType: "tmdb",
    website: "https://vidzen.fun",
    progress: { resumeParam: "startAt" },
    referrerPolicy: "no-referrer",
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  }),
  defineProvider({
    key: "vixsrc",
    name: "VixSrc",
    category: "other",
    idType: "tmdb",
    website: "https://vixsrc.to",
    progress: { resumeParam: "startAt" },
    referrerPolicy: "no-referrer",
    params: {
      primaryColor: { type: "hex" },
      secondaryColor: { type: "hex" },
      autoplay: { type: "boolean", default: true },
      startAt: { type: "time" },
      lang: { type: "string" }
    },
    moviePath: (id) => `/movie/${id}`,
    tvPath: (id, season, episode) => `/tv/${id}/${season}/${episode}`
  })
];

const PROVIDER_MAP: ReadonlyMap<ProviderKey, ProviderCatalogEntry> = (() => {
  const map = new Map<ProviderKey, ProviderCatalogEntry>();
  for (const provider of STREAM_PROVIDERS) {
    if (map.has(provider.key)) {
      throw new Error(`Duplicate provider key in STREAM_PROVIDERS: ${provider.key}`);
    }
    map.set(provider.key, provider);
  }
  return map;
})();

const ORIGIN_MAP: ReadonlyMap<string, ProviderCatalogEntry> = (() => {
  const map = new Map<string, ProviderCatalogEntry>();
  for (const provider of STREAM_PROVIDERS) {
    for (const origin of provider.origins) {
      if (origin === "*" || map.has(origin)) continue;
      map.set(origin, provider);
    }
  }
  return map;
})();

const WILDCARD_PROVIDER: ProviderCatalogEntry | undefined = STREAM_PROVIDERS.find(
  (provider) => provider.origins.includes("*") && provider.unsafeWildcardOrigin !== true
);

export function getProviderByKey(key: string): ProviderCatalogEntry | undefined {
  const resolvedKey = key as ProviderKey;
  return PROVIDER_MAP.get(resolvedKey);
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
  return ORIGIN_MAP.get(origin) ?? WILDCARD_PROVIDER;
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
    if (provider.key === "direct") return [];
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
  const sources: StreamSource[] = [];

  const override = getTvOrderingOverride(tmdbId);
  const directUrl = override?.videoUrlOverrides?.[`season=${season}&episode=${episode}`];
  if (directUrl) {
    sources.push({
      key: "direct",
      name: "Direct",
      url: directUrl
    });
  }

  const storedAniListAddress = anilistEpisodeMappings?.find(
    (mapping) => mapping.episodeNumber === episode
  );

  let aniListAddressPromise:
    | Promise<Awaited<ReturnType<typeof resolveAniListEpisodeAddress>>>
    | undefined;
  const getAniListAddress = () => {
    if (!aniListAddressPromise) {
      aniListAddressPromise = storedAniListAddress
        ? Promise.resolve({
            anilistId: storedAniListAddress.anilistId,
            episode: storedAniListAddress.anilistEpisodeNumber
          })
        : resolveAniListEpisodeAddress({ anilistId, title, season, seasonTitle, year, episode });
    }
    return aniListAddressPromise;
  };

  for (const provider of STREAM_PROVIDERS) {
    if (provider.key === "direct") continue;
    if (provider.animeOnly && !isAnime) continue;

    const fallbackId = getProviderId(provider, imdbId, tmdbId);
    const usesAniList = isAnime && !!provider.getAnimeTVUrl && provider.animeIdType === "anilist";
    const aniListAddress = usesAniList ? await getAniListAddress() : undefined;
    const animeId = usesAniList ? (aniListAddress?.anilistId ?? null) : null;

    const id = animeId ?? fallbackId;
    if (!id) continue;

    const isAnimeMatch = isAnime && !!provider.getAnimeTVUrl && !!animeId;
    const mapped = isAnimeMatch
      ? { season, episode: aniListAddress?.episode ?? episode }
      : mapCanonicalToProviderOrder(tmdbId, provider.name, { season, episode });
    const url = isAnimeMatch
      ? provider.getAnimeTVUrl!(id, mapped.season, mapped.episode, dub ?? false)
      : provider.getTVUrl(id, mapped.season, mapped.episode);

    sources.push({
      key: provider.key,
      name: provider.name,
      url
    });
  }

  return dedupeSources(sources);
}
