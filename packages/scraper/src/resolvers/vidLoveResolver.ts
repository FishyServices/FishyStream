import { browserHeaders, fetchProviderJson, resolveSubtitleTracks } from "./providerResolverBase";
import { isRecord, resolveMediaCandidate } from "../media";
import type { StreamResult } from "../types";

function getRequest(targetUrl: string): { apiUrl: URL; referrer: string } | null {
  try {
    const parsed = new URL(targetUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const kind = parts[1];
    const id = parts[2];
    if (
      parsed.hostname !== "player.vidlove.cc" ||
      parts[0] !== "embed" ||
      !id ||
      (kind !== "movie" && kind !== "tv")
    ) {
      return null;
    }

    const apiUrl = new URL(`/${kind}`, "https://api.vidlove.cc");
    apiUrl.searchParams.set("id", id);
    apiUrl.searchParams.set("mode", "json");
    if (kind === "tv") {
      if (!parts[3] || !parts[4]) return null;
      apiUrl.searchParams.set("season", parts[3]);
      apiUrl.searchParams.set("episode", parts[4]);
    }
    return { apiUrl, referrer: `${parsed.origin}/` };
  } catch {
    return null;
  }
}

function getSource(value: unknown): StreamResult | null {
  if (!isRecord(value) || !isRecord(value.source) || typeof value.source.url !== "string") {
    return null;
  }
  const source = value.source;
  const candidate = resolveMediaCandidate(
    source.url,
    typeof source.manifest === "string" && /#EXTM3U|#EXT-X-/i.test(source.manifest)
      ? "hls"
      : source.type,
    "https://player.vidlove.cc"
  );
  if (!candidate) return null;
  return {
    ...candidate,
    headers: { Origin: "https://player.vidlove.cc", Referer: "https://player.vidlove.cc/" },
    tracks: resolveSubtitleTracks(value.subtitles, "https://player.vidlove.cc")
  };
}

export async function resolveVidLove(targetUrl: string): Promise<StreamResult | null> {
  const request = getRequest(targetUrl);
  if (!request) return null;
  const value = await fetchProviderJson(request.apiUrl.href, {
    ...browserHeaders,
    Origin: "https://player.vidlove.cc",
    Referer: request.referrer
  });
  return getSource(value);
}
