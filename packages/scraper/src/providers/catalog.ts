import { resolveProvider } from "./fetcher";
import { resolve111Movies } from "./catalog/111Movies";
import { resolveMegaPlay } from "./catalog/megaPlay";
import { resolvePeachify } from "./catalog/peachify";
import { resolveVaplayer } from "./catalog/vaplayer";
import { resolveVideasy } from "./catalog/videasy";
import { resolveVidLove } from "./catalog/vidLove";
import { resolveVidNest } from "./catalog/vidNest";
import { resolveVidRock } from "./catalog/vidRock";
import { resolveVixSrc } from "./catalog/vixSrc";
import { resolveVidZee } from "./catalog/vidZee";
import { resolveVidZen } from "./catalog/vidZen";
import type { Stream } from "../types";

export type Provider = {
  id: string;
  matches: (url: URL) => boolean;
  resolve: (url: string) => Promise<Stream | null>;
};

const vidNestProvider: Provider = {
  id: "vidnest",
  matches: (url) => url.hostname === "vidnest.fun",
  resolve: resolveVidNest
};

const oneOneOneMoviesProvider: Provider = {
  id: "111movies",
  matches: (url) => url.hostname === "111movies.net",
  resolve: resolve111Movies
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
  resolve: resolveVidLove
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
  vixSrcProvider,
  genericProvider
];

const RESULT_TTL_MS = 30_000;
const recent = new Map<string, { promise: Promise<Stream | null>; expires: number }>();

async function runProviders(target: string): Promise<Stream | null> {
  const url = new URL(target);
  for (const provider of providers) {
    if (!provider.matches(url)) continue;
    const stream = await provider.resolve(target);
    if (stream) return stream;
  }
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
