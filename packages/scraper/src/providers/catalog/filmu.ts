import { fetchProvider, isPlayableStream } from "../fetcher";
import { findMedia, findMediaInText, originHeaders, resolveMedia } from "../media";
import type { Stream } from "../../types";

function isFilmuPlayerUrl(target: string): boolean {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "embed.filmu.in" || url.port) return false;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") parts.shift();
    if (parts[0] === "movie") return parts.length === 2 && /^\d{1,10}$/.test(parts[1]!);
    if (parts[0] === "tv")
      return (
        parts.length === 4 &&
        /^\d{1,10}$/.test(parts[1]!) &&
        /^\d{1,4}$/.test(parts[2]!) &&
        /^\d{1,4}$/.test(parts[3]!) &&
        Number(parts[3]) > 0
      );
    if (parts[0] === "anime")
      return parts.length === 3 && /^\d{1,12}$/.test(parts[1]!) && /^\d{1,4}$/.test(parts[2]!);
    return false;
  } catch {
    return false;
  }
}

function readPreloadedMedia(html: string, base: string): Stream | null {
  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0] ?? "";
    if (!/\brel=["']preload["']/i.test(tag)) continue;
    const raw = match[1]?.replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
    if (!raw) continue;
    try {
      const url = new URL(raw, base);
      if (url.protocol !== "https:") continue;
      if (url.pathname.endsWith("/proxy/m3u8") || url.pathname.startsWith("/p/"))
        return { url: url.href, mediaType: "hls", headers: originHeaders(url.href) };
      const direct = resolveMedia(url.href, base);
      if (direct) return direct;
    } catch {
      continue;
    }
  }
  return null;
}

function mediaFromPage(html: string, base: string): Stream | null {
  return (
    readPreloadedMedia(html, base) ??
    findMediaInText(html, base) ??
    (() => {
      try {
        return findMedia(JSON.parse(html) as unknown, base);
      } catch {
        return null;
      }
    })()
  );
}

export async function resolveFilmu(target: string): Promise<Stream | null> {
  if (!isFilmuPlayerUrl(target)) return null;
  try {
    const page = await fetchProvider(target, {
      Accept: "text/html,application/json,*/*",
      Referer: `${new URL(target).origin}/`
    });
    console.log(
      `[filmu] GET ${new URL(target).pathname} -> ${page.status}, final ${new URL(page.url || target).origin}`
    );
    if (!page.ok) {
      console.warn(`[filmu] player page returned HTTP ${page.status}`);
      return null;
    }
    const html = await page.text();
    const stream = mediaFromPage(html, page.url || target);
    if (!stream) {
      console.warn(`[filmu] no media preload found in ${html.length} byte player page`);
      return null;
    }
    if (!(await isPlayableStream(stream))) {
      console.warn(`[filmu] media probe failed for ${new URL(stream.url).hostname}`);
      return null;
    }
    console.log(`[filmu] resolved ${stream.mediaType} media from ${new URL(target).pathname}`);
    return stream;
  } catch (error) {
    console.warn(
      "[filmu] resolution failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return null;
  }
}

export const __filmuParser = { isFilmuPlayerUrl, readPreloadedMedia };
