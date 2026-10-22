import { INSECURE_TLS } from "../../fetcher";
import { resolveMedia } from "../../media";
import type { Stream } from "../../../types";

const ORIGIN = "https://tryembed.us.cc";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type AnimeRequest = { url: URL; id: string; episode: string; audio: "sub" | "dub" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): AnimeRequest | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "tryembed.us.cc" || url.port) return null;
    const [root, type, id, episode, audio, ...rest] = url.pathname.split("/").filter(Boolean);
    if (
      root !== "embed" ||
      type !== "anime" ||
      rest.length > 0 ||
      !id ||
      !/^\d{1,12}$/.test(id) ||
      !episode ||
      !/^\d{1,5}$/.test(episode) ||
      (audio !== "sub" && audio !== "dub")
    )
      return null;
    return { url, id, episode, audio };
  } catch {
    return null;
  }
}

async function fetchPage(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/html, */*",
      ...init.headers
    },
    redirect: "follow",
    ...INSECURE_TLS
  });
}

function updateCookies(response: Response, jar: Map<string, string>): void {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const lines = headers.getSetCookie?.() ?? [headers.get("set-cookie") ?? ""];
  for (const line of lines) {
    const value = line.split(";", 1)[0] ?? "";
    const separator = value.indexOf("=");
    if (separator < 1 || !value.startsWith("tryembed_")) continue;
    const name = value.slice(0, separator);
    if (/max-age=0/i.test(line)) jar.delete(name);
    else jar.set(name, value.slice(separator + 1));
  }
}

function cookies(jar: Map<string, string>): string | undefined {
  return jar.size ? [...jar].map(([name, value]) => `${name}=${value}`).join("; ") : undefined;
}

function media(value: unknown, base: string, type: unknown): Stream | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value, base);
    if (url.origin === ORIGIN && /^\/s\/[^/]+$/.test(url.pathname)) {
      url.pathname += type === "mp4" ? ".mp4" : ".m3u8";
    }
    return resolveMedia(url.href, base, type);
  } catch {
    return null;
  }
}

function serverIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((item) =>
        isRecord(item) && typeof item.id === "string" && /^[\w-]+$/.test(item.id) ? [item.id] : []
      )
    )
  ];
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function probe(stream: Stream, request: AnimeRequest): Promise<boolean> {
  try {
    const headers = new Headers({
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*",
      Origin: ORIGIN,
      Referer: request.url.href,
      ...stream.headers
    });
    const response = await fetch(stream.url, {
      headers,
      redirect: "follow",
      ...INSECURE_TLS
    });
    if (!response.ok && response.status !== 206) {
      console.log(`[tryembed] media probe HTTP ${response.status}`);
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      return body.startsWith("#EXTM3U");
    }
    await response.body?.cancel().catch(() => undefined);
    return !/^text\/|html|json|xml/i.test(response.headers.get("content-type") ?? "");
  } catch {
    return false;
  }
}

export async function resolveTryEmbed(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) return null;

  try {
    const page = await fetchPage(request.url.href, {
      headers: { Accept: "text/html,application/xhtml+xml", Referer: `${ORIGIN}/` }
    });
    if (!page.ok) return null;
    const html = await page.text();
    const ticket = html.match(/window\.BOOTSTRAP_TICKET="([^"]+)"/)?.[1];
    const shellText = html.match(/window\.INITIAL_SHELL_PAYLOAD=(\{[^;]+\});/)?.[1];
    if (!ticket || !shellText) return null;
    const shell: unknown = JSON.parse(shellText);
    const meta = isRecord(shell) && isRecord(shell.meta) ? shell.meta : null;
    if (
      !meta ||
      meta.type !== "anime" ||
      String(meta.anilist_id) !== request.id ||
      String(meta.episode) !== request.episode ||
      meta.audio !== request.audio
    )
      return null;

    const jar = new Map<string, string>();
    updateCookies(page, jar);
    const baseHeaders = {
      Origin: ORIGIN,
      Referer: request.url.href,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin"
    };
    const cookie = cookies(jar);
    const bootstrapResponse = await fetchPage(`${ORIGIN}/api/bootstrap`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "X-TryEmbed-Bootstrap": ticket,
        ...(cookie ? { Cookie: cookie } : {})
      }
    });
    const bootstrap = await readJson(bootstrapResponse);
    updateCookies(bootstrapResponse, jar);
    if (!isRecord(bootstrap) || typeof bootstrap.embedNonce !== "string") return null;

    const ids = serverIds(bootstrap.providers);
    const selectedId = isRecord(bootstrap.selectedProvider) ? bootstrap.selectedProvider.id : null;
    const orderedIds =
      typeof selectedId === "string" && ids.includes(selectedId)
        ? [selectedId, ...ids.filter((id) => id !== selectedId)]
        : ids;
    let nonce = bootstrap.embedNonce;

    for (const server of orderedIds) {
      const apiUrl = new URL(`${ORIGIN}/api/stream_data`);
      apiUrl.search = new URLSearchParams({
        id: request.id,
        episode: request.episode,
        audio: request.audio,
        player: "jw",
        server,
        nonce
      }).toString();
      const currentCookies = cookies(jar);
      const response = await fetchPage(apiUrl.href, {
        headers: {
          ...baseHeaders,
          "X-Embed-Nonce": nonce,
          ...(currentCookies ? { Cookie: currentCookies } : {})
        }
      });
      const payload = await readJson(response);
      updateCookies(response, jar);
      if (!isRecord(payload)) continue;
      if (typeof payload.embedNonce === "string") nonce = payload.embedNonce;
      const provider = isRecord(payload.selectedProvider) ? payload.selectedProvider : null;
      if (!provider || provider.status !== "ready") continue;

      for (const quality of Array.isArray(provider.qualities) ? provider.qualities : []) {
        if (!isRecord(quality)) continue;
        const extension = provider.type === "mp4" ? "mp4" : "m3u8";
        const candidates = [
          quality.directUrl,
          typeof quality.token === "string" ? `${ORIGIN}/s/${quality.token}.${extension}` : null,
          typeof quality.fallbackToken === "string"
            ? `${ORIGIN}/s/${quality.fallbackToken}.${extension}`
            : null
        ].flatMap((value) => {
          const result = media(value, apiUrl.href, provider.type);
          return result ? [result] : [];
        });
        for (const candidate of candidates) {
          const current = cookies(jar);
          const stream: Stream = {
            ...candidate,
            headers: {
              ...candidate.headers,
              ...baseHeaders,
              ...(current ? { Cookie: current } : {})
            }
          };
          if (await probe(stream, request)) return stream;
        }
      }
    }
    return null;
  } catch (error) {
    console.log(
      `[tryembed] resolution failed (${error instanceof Error ? error.name : "unknown error"})`
    );
    return null;
  }
}
