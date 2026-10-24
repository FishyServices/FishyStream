import { isPlayableStream, resolveProvider } from "./fetcher";
import {
  get111MoviesSourceOptions,
  resolve111Movies,
  resolve111MoviesSource
} from "./catalog/111Movies";
import { resolveMegaPlay } from "./catalog/megaPlay";
import { resolvePeachify } from "./catalog/broken/peachify";
import { resolveVaplayer } from "./catalog/broken/vaplayer";
import { resolveVideasy } from "./catalog/broken/videasy";
import { getVidLoveSourceOptions, resolveVidLove, resolveVidLoveSource } from "./catalog/vidLove";
import { resolveVidNest } from "./catalog/vidNest";
import { resolveVidRock } from "./catalog/vidRock";
import { resolveVixSrc } from "./catalog/broken/vixSrc";
import { resolveVidZee } from "./catalog/broken/vidZee";
import { resolveVidZen } from "./catalog/vidZen";
import { getVidBoltSourceOptions, resolveVidBolt, resolveVidBoltSource } from "./catalog/vidBolt";
import { getVidySourceOptions, resolveVidy, resolveVidySource } from "./catalog/vidy";
import { resolveVidFast } from "./catalog/broken/vidFast";
import { resolveAniEmbed } from "./catalog/aniEmbed";
import { resolveCinezo } from "./catalog/cinezo";
import { resolveTryEmbed } from "./catalog/broken/tryEmbed";
import type { Stream, StreamSourceOption } from "../types";

export type Provider = {
  id: string;
  matches: (url: URL) => boolean;
  resolve: (url: string) => Promise<Stream | null>;
  sourceOptions?: (url: string) => Promise<StreamSourceOption[]>;
  resolveSource?: (url: string, sourceKey: string) => Promise<Stream | null>;
};

const vidNestProvider: Provider = {
  id: "vidnest",
  matches: (url) => url.hostname === "vidnest.fun",
  resolve: resolveVidNest
};

const oneOneOneMoviesProvider: Provider = {
  id: "111movies",
  matches: (url) => url.hostname === "111movies.net",
  resolve: resolve111Movies,
  sourceOptions: get111MoviesSourceOptions,
  resolveSource: resolve111MoviesSource
};

const megaPlayProvider: Provider = {
  id: "megaplay",
  matches: (url) => url.hostname === "megaplay.buzz",
  resolve: resolveMegaPlay
};

const vidRockProvider: Provider = {
  id: "vidrock",
  matches: (url) => ["vidrock.ru", "vidrock.to", "vidrock.net"].includes(url.hostname),
  resolve: resolveVidRock
};

const vidLoveProvider: Provider = {
  id: "vidlove",
  matches: (url) => url.hostname === "player.vidlove.cc",
  resolve: resolveVidLove,
  sourceOptions: getVidLoveSourceOptions,
  resolveSource: resolveVidLoveSource
};

const peachifyProvider: Provider = {
  id: "peachify",
  matches: (url) => url.hostname === "peachify.top",
  resolve: resolvePeachify
};

const vaplayerProvider: Provider = {
  id: "vaplayer",
  matches: (url) => url.hostname === "vaplayer.ru",
  resolve: resolveVaplayer
};

const videasyProvider: Provider = {
  id: "videasy",
  matches: (url) => url.hostname === "player.videasy.net",
  resolve: resolveVideasy
};

const vidZenProvider: Provider = {
  id: "vidzen",
  matches: (url) => url.hostname === "vidzen.fun",
  resolve: resolveVidZen
};

const vidBoltProvider: Provider = {
  id: "vidbolt",
  matches: (url) => url.hostname === "vidbolt.xyz",
  resolve: resolveVidBolt,
  sourceOptions: getVidBoltSourceOptions,
  resolveSource: resolveVidBoltSource
};

const vidyProvider: Provider = {
  id: "vidy",
  matches: (url) => url.hostname === "www.vidy.st",
  resolve: resolveVidy,
  sourceOptions: getVidySourceOptions,
  resolveSource: resolveVidySource
};

const vidZeeProvider: Provider = {
  id: "vidzee",
  matches: (url) => url.hostname === "player.vidzee.wtf",
  resolve: resolveVidZee
};

const vixSrcProvider: Provider = {
  id: "vixsrc",
  matches: (url) => url.hostname === "vixsrc.to",
  resolve: resolveVixSrc
};

const vidFastProvider: Provider = {
  id: "vidfast",
  matches: (url) =>
    [
      "vidfast.pro",
      "vidfast.in",
      "vidfast.io",
      "vidfast.me",
      "vidfast.net",
      "vidfast.pm",
      "vidfast.vc",
      "vidfast.bz",
      "vidfast.xyz"
    ].includes(url.hostname),
  resolve: resolveVidFast
};

const aniEmbedProvider: Provider = {
  id: "aniembed",
  matches: (url) => url.hostname === "aniembed.se",
  resolve: resolveAniEmbed
};

const cinezoProvider: Provider = {
  id: "cinezo",
  matches: (url) => url.hostname === "player.cinezo.live",
  resolve: resolveCinezo
};

const tryEmbedProvider: Provider = {
  id: "tryembed",
  matches: (url) => url.hostname === "tryembed.us.cc",
  resolve: resolveTryEmbed
};

const genericProvider: Provider = {
  id: "direct-fetch",
  matches: () => true,
  resolve: resolveProvider
};

export const providers: readonly Provider[] = [
  oneOneOneMoviesProvider,
  vidNestProvider,
  megaPlayProvider,
  vidRockProvider,
  vidLoveProvider,
  peachifyProvider,
  vaplayerProvider,
  videasyProvider,
  vidZeeProvider,
  vidZenProvider,
  vidBoltProvider,
  vidyProvider,
  vixSrcProvider,
  vidFastProvider,
  aniEmbedProvider,
  cinezoProvider,
  tryEmbedProvider,
  genericProvider
];

const RESULT_TTL_MS = 30_000;
const recent = new Map<string, { promise: Promise<Stream | null>; expires: number }>();

async function runProviders(target: string): Promise<Stream | null> {
  const url = new URL(target);
  for (const provider of providers) {
    if (!provider.matches(url)) continue;
    try {
      const stream = await provider.resolve(target);
      if (stream) return stream;
      console.warn(`[scraper] ${provider.id} returned no stream for ${url.origin}${url.pathname}`);
    } catch (error) {
      console.error(
        `[scraper] ${provider.id} failed for ${url.origin}${url.pathname}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  console.warn(`[scraper] no provider resolved ${url.origin}${url.pathname}`);
  return null;
}

export async function resolveWithProviders(target: string): Promise<Stream | null> {
  const existing = recent.get(target);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const promise = runProviders(target);
  recent.set(target, { promise, expires: Date.now() + RESULT_TTL_MS });
  promise.then(
    (stream) => {
      if (!stream) recent.delete(target);
    },
    () => recent.delete(target)
  );
  return promise;
}

export async function resolveFirstWorkingWithProviders(
  targets: string[]
): Promise<{ target: string; stream: Stream; sourceOptions: StreamSourceOption[] } | null> {
  for (const target of targets) {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;

    const stream = await resolveWithProviders(target).catch((error) => {
      console.error(
        `[scraper] candidate resolution failed for ${url.origin}${url.pathname}:`,
        error
      );
      return null;
    });
    if (!stream) continue;
    if (!(await isPlayableStream(stream))) {
      console.warn(
        `[scraper] candidate stream failed playback probe: ${url.origin}${url.pathname}`
      );
      continue;
    }
    const sourceOptions = await getSourceOptionsWithProviders(target).catch(() => []);
    return { target, stream, sourceOptions };
  }
  return null;
}

export async function getSourceOptionsWithProviders(target: string): Promise<StreamSourceOption[]> {
  const url = new URL(target);
  for (const provider of providers) {
    if (!provider.matches(url)) continue;
    return provider.sourceOptions ? provider.sourceOptions(target) : [];
  }
  return [];
}

export async function resolveSourceWithProviders(
  target: string,
  sourceKey: string
): Promise<Stream | null> {
  const url = new URL(target);
  for (const provider of providers) {
    if (!provider.matches(url)) continue;
    return provider.resolveSource ? provider.resolveSource(target, sourceKey) : null;
  }
  return null;
}
