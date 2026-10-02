import { browserHeaders, fetchProviderJson, resolveProviderStream } from "./providerResolverBase";
import { isRecord } from "../media";
import type { StreamResult } from "../types";

function getRequest(targetUrl: string): { origin: string; apiUrl: URL } | null {
  try {
    const parsed = new URL(targetUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const kind = parts[0];
    const id = parts[1];
    if (parsed.hostname !== "vidzen.fun" || !id || (kind !== "movie" && kind !== "tv")) return null;
    const apiUrl = new URL("/api/sources", parsed.origin);
    apiUrl.searchParams.set("type", kind);
    apiUrl.searchParams.set("id", id);
    if (kind === "tv") {
      if (!parts[2] || !parts[3]) return null;
      apiUrl.searchParams.set("season", parts[2]);
      apiUrl.searchParams.set("episode", parts[3]);
    }
    return { origin: parsed.origin, apiUrl };
  } catch {
    return null;
  }
}

function getSource(value: unknown, origin: string): StreamResult | null {
  if (!isRecord(value) || !Array.isArray(value.sources)) return null;
  for (const source of value.sources) {
    const result = resolveProviderStream(source, origin);
    if (result) return result;
  }
  return null;
}

export async function resolveVidZen(targetUrl: string): Promise<StreamResult | null> {
  const request = getRequest(targetUrl);
  if (!request) return null;
  const value = await fetchProviderJson(request.apiUrl.href, {
    ...browserHeaders,
    Referer: `${request.origin}/`
  });
  return getSource(value, request.origin);
}
