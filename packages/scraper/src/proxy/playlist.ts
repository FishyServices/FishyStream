import type { StreamHeaders } from "../types";

function resolve(value: string, base: string): string {
  return new URL(value, base).href;
}

export function rewritePlaylist(
  content: string,
  playlistUrl: string,
  proxyBase: string,
  headers: StreamHeaders
): string {
  const master = /#EXT-X-STREAM-INF/i.test(content);
  const encoded = encodeURIComponent(JSON.stringify(headers));
  return content
    .split("\n")
    .map((line) => {
      const uri = line.match(/URI="([^"]+)"/)?.[1];
      if (uri) {
        const target = resolve(uri, playlistUrl);
        const endpoint = line.startsWith("#EXT-X-MEDIA") ? "/api/m3u8-proxy" : "/api/ts-proxy";
        return line.replace(
          `URI="${uri}"`,
          `URI="${proxyBase}${endpoint}?url=${encodeURIComponent(target)}&headers=${encoded}"`
        );
      }
      if (!line.trim() || line.startsWith("#")) return line;
      const target = resolve(line.trim(), playlistUrl);
      const endpoint = master ? "/api/m3u8-proxy" : "/api/ts-proxy";
      return `${proxyBase}${endpoint}?url=${encodeURIComponent(target)}&headers=${encoded}`;
    })
    .join("\n");
}
