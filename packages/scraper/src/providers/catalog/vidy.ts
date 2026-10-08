import { resolveMedia } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const PLAYER_ORIGIN = "https://www.vidy.st";
const API_ORIGIN = "https://api.wecollege.net";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;
const MAX_PLAYER_SCRIPTS = 40;
const GOLDEN_RATIO = 2_654_435_769;

type Request = {
  kind: "movie" | "tv";
  id: string;
  season?: string;
  episode?: string;
  pageUrl: string;
};

type TitleDetails = {
  title: string;
  year: number;
  imdbId: string;
  totalSeasons?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "www.vidy.st" || url.port) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [kind, id, season, episode] = parts;
    if (!id || !/^\d+$/.test(id)) return null;
    if (kind === "movie" && parts.length === 2) return { kind, id, pageUrl: url.href };
    if (
      kind === "tv" &&
      parts.length === 4 &&
      season &&
      episode &&
      /^\d+$/.test(season) &&
      /^\d+$/.test(episode)
    ) {
      return { kind, id, season, episode, pageUrl: url.href };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchText(
  url: string,
  referer: string
): Promise<{ response: Response; text: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Origin: PLAYER_ORIGIN,
        Referer: referer
      },
      signal: controller.signal
    });
    return { response, text: await response.text() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, referer: string): Promise<unknown | null> {
  const result = await fetchText(url, referer);
  if (!result?.response.ok) return null;
  try {
    return JSON.parse(result.text);
  } catch {
    return null;
  }
}

async function readPlayerScripts(pageUrl: string): Promise<string[]> {
  const page = await fetchText(pageUrl, pageUrl);
  if (!page?.response.ok) return [];

  const queue: string[] = [];
  const inlineScripts = [...page.text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
  for (const match of page.text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1]!, pageUrl);
      if (url.origin === PLAYER_ORIGIN && url.pathname.endsWith(".js")) queue.push(url.href);
    } catch {
      continue;
    }
  }

  const buildId = page.text.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)?.[1];
  if (buildId) queue.push(`${PLAYER_ORIGIN}/_next/static/${buildId}/_buildManifest.js`);

  const scripts = [...inlineScripts];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length && visited.size < MAX_PLAYER_SCRIPTS; index += 1) {
    const scriptUrl = queue[index]!;
    if (visited.has(scriptUrl)) continue;
    visited.add(scriptUrl);
    const result = await fetchText(scriptUrl, pageUrl);
    if (!result?.response.ok) continue;
    scripts.push(result.text);

    for (const match of result.text.matchAll(/(\d+)===[\w$]+\?["']([^"']+\.js)["']/g)) {
      // The webpack runtime maps lazy chunk ids (including Vidy’s source module) to file names.
      if (!result.text.includes(`.e(${match[1]})`)) continue;
      const chunkPath = match[2]!.startsWith("static/") ? `/_next/${match[2]}` : match[2]!;
      const chunkUrl = new URL(chunkPath, PLAYER_ORIGIN).href;
      if (!visited.has(chunkUrl)) queue.push(chunkUrl);
    }

    for (const match of result.text.matchAll(/(?:\.e|\.\w+\.e)\((\d+)\)/g)) {
      const chunkId = match[1]!;
      const runtimeMap = scripts.join("\n");
      const mapping = runtimeMap.match(new RegExp(`${chunkId}===[\\w$]+\\?["']([^"']+\\.js)["']`));
      if (!mapping) continue;
      const chunkPath = mapping[1]!.startsWith("static/") ? `/_next/${mapping[1]}` : mapping[1]!;
      const chunkUrl = new URL(chunkPath, PLAYER_ORIGIN).href;
      if (!visited.has(chunkUrl)) queue.push(chunkUrl);
    }
  }
  return scripts;
}

async function discoverSourceCities(pageUrl: string): Promise<string[]> {
  const scripts = await readPlayerScripts(pageUrl);
  const cities = new Set<string>();
  for (const script of scripts) {
    for (const match of script.matchAll(/["'`]\/([a-z]+)\/sources["'`]/g)) cities.add(match[1]!);
  }
  return [...cities];
}

function readTitleDetails(value: unknown, kind: Request["kind"]): TitleDetails | null {
  if (!isRecord(value)) return null;
  const title = kind === "movie" ? value.title : value.name;
  const date = kind === "movie" ? value.release_date : value.first_air_date;
  const externalIds = value.external_ids;
  if (typeof title !== "string" || typeof date !== "string" || !isRecord(externalIds)) return null;
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year) || year <= 0) return null;
  return {
    title,
    year,
    imdbId: typeof externalIds.imdb_id === "string" ? externalIds.imdb_id : "",
    ...(typeof value.number_of_seasons === "number"
      ? { totalSeasons: value.number_of_seasons }
      : {})
  };
}

async function getTitleDetails(request: Request): Promise<TitleDetails | null> {
  const url = new URL(`${TMDB_API}/${request.kind}/${request.id}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("append_to_response", "external_ids");
  return readTitleDetails(await fetchJson(url.href, `${PLAYER_ORIGIN}/`), request.kind);
}

function rotateLeft(value: number, shift: number): number {
  const amount = shift & 31;
  const word = value >>> 0;
  return amount === 0 ? word : ((word << amount) | (word >>> (32 - amount))) >>> 0;
}

function mix(value: number): number {
  let word = value >>> 0;
  word ^= word >>> 16;
  word = Math.imul(word, 2_246_822_507) >>> 0;
  word ^= word >>> 13;
  word = Math.imul(word, 3_266_489_909) >>> 0;
  return (word ^ (word >>> 16)) >>> 0;
}

function makeKeyStream(seed: string, mediaId: number, length: number): Uint8Array<ArrayBuffer> {
  const state: (number | undefined)[] = Array(61);
  let hash = 2_166_136_261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0;

  let stateSeed = mix(mix(hash) ^ mix((mediaId >>> 0) ^ GOLDEN_RATIO));
  for (let index = 0; index < 8; index += 1) {
    const slot = stateSeed % 61;
    stateSeed = rotateLeft((stateSeed + GOLDEN_RATIO) >>> 0, 7 + (7 & index));
    state[slot] = (stateSeed ^ mix(stateSeed)) >>> 0;
    stateSeed = mix((stateSeed + slot) >>> 0);
  }

  let accumulator = mix(2_779_096_485 ^ stateSeed);
  const output = new Uint8Array(length);
  let offset = 0;
  let counter = 0;
  while (offset < length) {
    const slot = accumulator % 61;
    const present = slot in state;
    const slotValue = state[slot] ?? 0;
    const mixedSlot = (slotValue ^ Math.imul(GOLDEN_RATIO, counter + 1)) >>> 0;
    const word =
      ((accumulator ^ mixedSlot) | (accumulator & mixedSlot & (present ? 0xffff_ffff : 0))) >>> 0;
    const rotated =
      rotateLeft((word + accumulator) >>> 0, slot) ^ rotateLeft(accumulator, Math.imul(slot, 7));
    accumulator = mix((rotated + GOLDEN_RATIO) >>> 0);
    state[slot] = accumulator;
    for (let shift = 0; shift < 32 && offset < length; shift += 8) {
      output[offset] = (accumulator >>> shift) & 0xff;
      offset += 1;
    }
    counter += 1;
  }
  return output;
}

function decodeSources(ciphertext: string, seed: string, mediaId: number): string | null {
  try {
    const normalized = ciphertext.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const encrypted = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      encrypted[index] = binary.charCodeAt(index);
    const keyStream = makeKeyStream(seed, mediaId, encrypted.length);
    const plaintext = new Uint8Array(encrypted.length);
    for (let index = 0; index < encrypted.length; index += 1) {
      plaintext[index] = encrypted[index]! ^ keyStream[index]!;
    }
    if (
      plaintext.length < 4 ||
      plaintext[0] !== 109 ||
      plaintext[1] !== 118 ||
      plaintext[2] !== 109 ||
      plaintext[3] !== 49
    ) {
      return null;
    }
    return new TextDecoder().decode(plaintext.subarray(4));
  } catch {
    return null;
  }
}

function sourceUrl(request: Request, details: TitleDetails, seed: string, city: string): string {
  const url = new URL(`/${city}/sources`, API_ORIGIN);
  url.searchParams.set("title", details.title);
  url.searchParams.set("mediaType", request.kind);
  url.searchParams.set("year", String(details.year));
  if (details.totalSeasons !== undefined)
    url.searchParams.set("totalSeasons", String(details.totalSeasons));
  if (request.episode) url.searchParams.set("episodeId", request.episode);
  if (request.season) url.searchParams.set("seasonId", request.season);
  url.searchParams.set("tmdbId", request.id);
  if (details.imdbId) url.searchParams.set("imdbId", details.imdbId);
  url.searchParams.set("enc", "2");
  url.searchParams.set("seed", seed);
  return url.href;
}

function readTracks(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const tracks = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const file = typeof item.url === "string" ? item.url : item.file;
    if (typeof file !== "string") return [];
    let absolute: string;
    try {
      absolute = new URL(file, API_ORIGIN).href;
    } catch {
      return [];
    }
    if (!/^https?:$/.test(new URL(absolute).protocol) || seen.has(absolute)) return [];
    seen.add(absolute);
    const label =
      typeof item.label === "string"
        ? item.label
        : typeof item.lang === "string"
          ? item.lang
          : undefined;
    return [{ file: absolute, ...(label ? { label } : {}) }];
  });
  return tracks.length > 0 ? tracks : undefined;
}

async function probe(stream: Stream): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: StreamHeaders = { ...stream.headers };
  if (stream.mediaType === "file") headers.Range = "bytes=0-1023";
  try {
    const response = await fetch(stream.url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      signal: controller.signal
    });
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      return response.ok && body.startsWith("#EXTM3U");
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    return (
      (response.status === 200 || response.status === 206) &&
      !/text\/|html|json|xml/.test(contentType)
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveVidy(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) return null;
  const details = await getTitleDetails(request);
  if (!details) return null;

  const seedUrl = new URL("/seed", API_ORIGIN);
  seedUrl.searchParams.set("mediaId", request.id);
  const seedPayload = await fetchJson(seedUrl.href, request.pageUrl);
  if (!isRecord(seedPayload) || typeof seedPayload.seed !== "string" || !seedPayload.seed)
    return null;

  const headers: StreamHeaders = { Origin: PLAYER_ORIGIN, Referer: `${PLAYER_ORIGIN}/` };
  for (const city of await discoverSourceCities(request.pageUrl)) {
    try {
      const sourceResult = await fetchText(
        sourceUrl(request, details, seedPayload.seed, city),
        request.pageUrl
      );
      if (!sourceResult?.response.ok) continue;
      const decoded = decodeSources(sourceResult.text.trim(), seedPayload.seed, Number(request.id));
      if (!decoded) continue;

      const payload: unknown = JSON.parse(decoded);
      if (!isRecord(payload)) continue;
      const tracks = readTracks(payload.subtitles);
      const candidates: unknown[] = [];
      if (typeof payload.playlist === "string")
        candidates.push({ url: payload.playlist, type: "hls" });
      if (Array.isArray(payload.sources)) {
        candidates.push(...payload.sources);
      }
      for (const candidate of candidates) {
        if (!isRecord(candidate) || typeof candidate.url !== "string") continue;
        const media = resolveMedia(candidate.url, API_ORIGIN, candidate.type);
        if (!media) continue;
        const stream: Stream = { ...media, headers, ...(tracks ? { tracks } : {}) };
        if (await probe(stream)) return stream;
      }
    } catch {}
  }
  return null;
}
