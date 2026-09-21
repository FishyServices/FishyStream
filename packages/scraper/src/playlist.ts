import { inheritPlaylistQueryParameters, resolveUrl } from "./media";
import type { StreamHeaders } from "./types";

export function rewriteHlsPlaylist(args: {
  content: string;
  playlistUrl: string;
  base: string;
  headers: StreamHeaders;
}): string {
  const { content, playlistUrl, base, headers } = args;
  const isMaster = /#EXT-X-STREAM-INF/i.test(content);
  const encodedHeaders = encodeURIComponent(JSON.stringify(headers));

  return content
    .split("\n")
    .map((line) => {
      if (line.startsWith("#")) {
        const uriMatch = line.match(/URI="([^"]+)"/);
        if (!uriMatch?.[1]) return line;
        const original = uriMatch[1];
        const resolved = inheritPlaylistQueryParameters(
          resolveUrl(original, playlistUrl),
          playlistUrl
        );
        const endpoint = line.startsWith("#EXT-X-MEDIA") ? "/api/m3u8-proxy" : "/api/ts-proxy";
        const proxied = `${base}${endpoint}?url=${encodeURIComponent(resolved)}&headers=${encodedHeaders}`;
        return line.replace(`URI="${original}"`, `URI="${proxied}"`);
      }

      if (!line.trim()) return line;
      const resolved = inheritPlaylistQueryParameters(
        resolveUrl(line.trim(), playlistUrl),
        playlistUrl
      );
      const endpoint = isMaster ? "/api/m3u8-proxy" : "/api/ts-proxy";
      return `${base}${endpoint}?url=${encodeURIComponent(resolved)}&headers=${encodedHeaders}`;
    })
    .join("\n");
}
