import { getOriginHeaders, isFetchableUrl } from "../media";
import type { StreamHeaders } from "../types";

async function fetchUpstream(url: string, headers: StreamHeaders): Promise<Response> {
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") requestHeaders.set(name, value);
  }
  return fetch(url, { headers: requestHeaders });
}

export async function fetchProviderWithReferrerFallback(
  url: string,
  headers: StreamHeaders
): Promise<Response> {
  if (!isFetchableUrl(url)) {
    throw new TypeError("Provider URL must use the http:, https:, or s3: protocol");
  }

  const requestHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ...headers
  };
  const response = await fetchUpstream(url, requestHeaders);
  if (response.status !== 401 && response.status !== 403 && response.status !== 404) {
    return response;
  }

  const fallbackHeaders = { ...requestHeaders, ...getOriginHeaders(url) };
  if (
    fallbackHeaders.Referer === requestHeaders.Referer &&
    fallbackHeaders.Origin === requestHeaders.Origin
  ) {
    return response;
  }
  return fetchUpstream(url, fallbackHeaders);
}
