import { resolveMedia } from "../media";
import { isPlayableStream } from "../fetcher";
import type { Stream, StreamHeaders } from "../../types";

const PLAYER_ORIGIN = "https://player.cinezo.live";
const API_TIMEOUT_MS = 25_000;
const SOURCE_CACHE_TTL_MS = 60_000;
const log = (...args: unknown[]) => console.log("[cinezo]", ...args);
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type SourceOption = { id: string; label: string; movieUrl: string; tvUrl: string };
let sourceCache: { values: SourceOption[]; expiresAt: number } | undefined;

type Request =
  { type: "movie"; id: string } | { type: "tv"; id: string; season: string; episode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  const reject = (): null => {
    log("could not parse player URL:", target);
    return null;
  };

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return reject();
  }
  if (url.protocol !== "https:") return reject();
  if (url.hostname !== "player.cinezo.live") return reject();
  const parts = url.pathname.split("/").filter(Boolean);
  const [embed, type, id, season, episode] = parts;
  if (embed !== "embed") return reject();
  if (!id || !/^\d{1,10}$/.test(id)) return reject();
  if (type === "movie" && parts.length === 3) return { type, id };
  if (type === "movie") return reject();
  if (
    type === "tv" &&
    parts.length === 5 &&
    season &&
    episode &&
    /^\d{1,4}$/.test(season) &&
    /^\d{1,4}$/.test(episode)
  ) {
    return { type, id, season, episode };
  }
  return reject();
}

async function discoverSources(target: string): Promise<SourceOption[]> {
  if (sourceCache && sourceCache.expiresAt > Date.now()) return sourceCache.values;
  try {
    const page = await fetch(target, {
      headers: { Accept: "text/html", Referer: `${PLAYER_ORIGIN}/`, "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
    if (!page.ok) return [];
    const html = await page.text();
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)]
      .map((match) => match[1])
      .filter((path): path is string => typeof path === "string");
    for (const path of scripts) {
      const scriptUrl = new URL(path, target);
      if (scriptUrl.origin !== PLAYER_ORIGIN) continue;
      const response = await fetch(scriptUrl, {
        headers: {
          Accept: "text/javascript,*/*",
          Referer: target,
          "User-Agent": USER_AGENT
        },
        signal: AbortSignal.timeout(API_TIMEOUT_MS)
      });
      if (!response.ok) continue;
      const code = await response.text();
      const list = [
        ...code.matchAll(/\[((?:\{id:["'][^"']+["'],label:["'][^"']+["'][^{}]*\},?){2,})\]/g)
      ]
        .map((match) => match[1] ?? "")
        .sort((left, right) => right.length - left.length)[0];
      if (!list) continue;
      const constants = Object.fromEntries(
        [...code.matchAll(/(?:const|let|var)\s+([\w$]+)=["'](https?:\/\/[^"']+)["']/g)].map(
          (match) => [match[1]!, match[2]!]
        )
      );
      const defaultTemplateMatches = [
        ...code.matchAll(/return\s+([\w$]+)===["']tv["'][^?]*\?`([^`]+)`:`([^`]+)`/g)
      ];
      const defaultTemplates = defaultTemplateMatches.at(-1);
      if (!defaultTemplates?.[2] || !defaultTemplates[3]) continue;
      const defaultBindings = urlTemplateBindings(code, defaultTemplates.index!);
      if (!defaultBindings) continue;
      const defaultSourceBinding = Object.keys(defaultBindings).find(
        (key) => defaultBindings[key] === "__SOURCE_ID__"
      );
      if (!defaultSourceBinding) continue;
      const values = [...list.matchAll(/\{id:["']([^"']+)["'],label:["']([^"']+)["']/g)]
        .map((match) => {
          const id = match[1]!;
          const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const branchRegex = new RegExp(
            `if\\(([\\w$]+)===["']${escapedId}["']\\)\\{return[^?]*\\?\\x60([^\\x60]+)\\x60:\\x60([^\\x60]+)\\x60\\}`
          );
          const branch = branchRegex.exec(code);
          const bindings = branch
            ? urlTemplateBindings(code, branch.index, id, branch[1]!)
            : { ...defaultBindings, [defaultSourceBinding]: id };
          if (!bindings) return null;
          const movieUrl = expandUrlTemplate(
            branch?.[3] ?? defaultTemplates[3]!,
            bindings,
            constants
          );
          const tvUrl = expandUrlTemplate(branch?.[2] ?? defaultTemplates[2]!, bindings, constants);
          return movieUrl && tvUrl ? { id, label: match[2]!, movieUrl, tvUrl } : null;
        })
        .filter((value): value is SourceOption => value !== null);
      if (values.length) {
        sourceCache = { values, expiresAt: Date.now() + SOURCE_CACHE_TTL_MS };
        log(
          "discovered player sources:",
          values.map(({ id }) => id)
        );
        return values;
      }
    }
  } catch (error) {
    log("could not discover player sources:", error instanceof Error ? error.message : error);
  }
  return [];
}

function urlTemplateBindings(
  code: string,
  index: number,
  sourceId?: string,
  sourceVariable?: string
): Record<string, string> | null {
  const functionIndex = code.lastIndexOf("function", index);
  const declaration = code.slice(functionIndex, index).match(/^function\s*[\w$]*\(([^)]*)\)/);
  const parameters = declaration?.[1]?.split(",").map((parameter) => parameter.trim());
  if (!parameters || parameters.length < 5) return null;
  const sourceParameterIndex = sourceVariable ? parameters.indexOf(sourceVariable) : 0;
  if (sourceParameterIndex < 0) return null;
  return {
    [parameters[sourceParameterIndex]!]: sourceId ?? "__SOURCE_ID__",
    [parameters[2]!]: "__CONTENT_ID__",
    [parameters[3]!]: "__SEASON__",
    [parameters[4]!]: "__EPISODE__"
  };
}

function expandUrlTemplate(
  template: string,
  bindings: Record<string, string>,
  constants: Record<string, string>
): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, expression: string) => {
    const name = expression.trim();
    if (name in bindings) return bindings[name]!;
    if (name in constants) return constants[name]!;
    const literal = name.match(/^["'](.*)["']$/);
    return literal?.[1] ?? "";
  });
}

function sourceUrls(request: Request, sources: SourceOption[]): string[] {
  return sources.map(({ movieUrl, tvUrl }) => {
    const template = request.type === "tv" ? tvUrl : movieUrl;
    return template
      .replaceAll("__CONTENT_ID__", request.id)
      .replaceAll("__SEASON__", request.type === "tv" ? request.season : "")
      .replaceAll("__EPISODE__", request.type === "tv" ? request.episode : "");
  });
}

function parsePayloads(text: string): unknown[] {
  try {
    return [JSON.parse(text) as unknown];
  } catch {
    const payloads: unknown[] = [];
    for (const match of text.matchAll(/^data:\s*(\{.*\})\s*$/gm)) {
      const data = match[1];
      if (!data) continue;
      try {
        payloads.push(JSON.parse(data) as unknown);
      } catch {}
    }
    return payloads;
  }
}

async function fetchPayloads(url: string): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/event-stream",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: `${PLAYER_ORIGIN}/`
      },
      signal: controller.signal
    });
    log(`GET ${new URL(url).origin}${new URL(url).pathname} -> ${response.status}`);
    if (!response.ok) {
      log("  response body:", (await response.text()).slice(0, 250));
      return [];
    }
    const text = await response.text();
    const payloads = parsePayloads(text);
    if (payloads.length === 0)
      log("  response contained no JSON or SSE source events:", text.slice(0, 250));
    else log(`  parsed ${payloads.length} JSON/SSE event(s)`);
    return payloads;
  } catch (error) {
    log("  request failed:", error instanceof Error ? error.message : error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function readStream(value: unknown, base: string): Stream | null {
  if (!isRecord(value)) return null;
  const stream = isRecord(value.stream) ? value.stream : value;
  const source = isRecord(value.source) ? value.source : value;
  const candidate =
    (typeof stream.hls === "string" && stream.hls) ||
    (typeof stream.remux === "string" && stream.remux) ||
    (typeof stream.original === "string" && stream.original) ||
    (typeof value.url === "string" && value.url) ||
    (typeof source.url === "string" && source.url);
  let hint = source.type ?? stream.type;
  let wrappedHint: string | undefined;
  if (typeof candidate === "string") {
    try {
      const wrappedUrl = new URL(candidate, base).searchParams.get("url");
      if (wrappedUrl) {
        const mediaPath = new URL(wrappedUrl).pathname;
        if (/\.m3u8$/i.test(mediaPath)) wrappedHint = "hls";
        else if (/\.(?:mp4|webm|mov)$/i.test(mediaPath)) wrappedHint = "file";
      }
    } catch {}
  }
  const media = resolveMedia(candidate, base, hint) ?? resolveMedia(candidate, base, wrappedHint);
  if (!media) return null;

  const sourceHeaders: StreamHeaders = {};
  if (isRecord(source.headers)) {
    for (const [name, value] of Object.entries(source.headers)) {
      if (typeof value === "string" && value) sourceHeaders[name] = value;
    }
  }
  const headers: StreamHeaders = {
    ...media.headers,
    ...sourceHeaders,
    Referer: sourceHeaders.Referer ?? `${PLAYER_ORIGIN}/`,
    Origin: sourceHeaders.Origin ?? PLAYER_ORIGIN
  };
  return { ...media, headers };
}

export async function resolveCinezo(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) return null;
  log("resolving", request);

  const sources = await discoverSources(target);
  for (const apiUrl of sourceUrls(request, sources)) {
    for (const payload of await fetchPayloads(apiUrl)) {
      const stream = readStream(payload, apiUrl);
      if (!stream) continue;
      if (await isPlayableStream(stream)) {
        log(`FOUND ${stream.mediaType} stream on ${new URL(stream.url).hostname}`);
        return stream;
      }
      log(
        `  ${stream.mediaType} candidate failed the playback probe (${new URL(stream.url).hostname})`
      );
    }
  }
  log("all source APIs exhausted");
  return null;
}
