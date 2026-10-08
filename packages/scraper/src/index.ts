import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  getSourceOptionsWithProviders,
  resolveSourceWithProviders,
  resolveWithProviders
} from "./providers/catalog";
import { registerProxyRoutes } from "./proxy/routes";
import type { ScrapeBindings } from "./types";

const app = new Hono<{ Bindings: ScrapeBindings }>();

app.use("/*", cors());

function proxiedStream(
  stream: Awaited<ReturnType<typeof resolveWithProviders>>,
  host: string | undefined
) {
  if (!stream) return null;
  const base = `${host?.includes("localhost") ? "http" : "https"}://${host ?? "localhost:4000"}`;
  const endpoint = stream.mediaType === "hls" ? "/api/m3u8-proxy" : "/api/media-proxy";
  return {
    name: stream.name ?? "Stream",
    sourceKey: stream.sourceKey,
    streamUrl: `${base}${endpoint}?url=${encodeURIComponent(stream.url)}&headers=${encodeURIComponent(JSON.stringify(stream.headers))}`,
    mediaType: stream.mediaType,
    tracks: stream.tracks ?? null,
    intro: stream.intro ?? null,
    outro: stream.outro ?? null
  };
}

app.get("/api/scrape/source", async (c) => {
  const target = c.req.query("url");
  if (!target) return c.json({ error: "Missing url parameter" }, 400);
  const sourceKey = c.req.query("source");
  if (!sourceKey) return c.json({ error: "Missing source parameter" }, 400);
  try {
    const stream = await resolveSourceWithProviders(target, sourceKey);
    if (!stream) return c.json({ error: "Could not find a playable stream for this source" }, 404);
    return c.json(proxiedStream(stream, c.req.header("host")));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Scraping failed" }, 502);
  }
});

app.get("/api/scrape", async (c) => {
  const target = c.req.query("url");
  if (!target) return c.json({ error: "Missing url parameter" }, 400);
  try {
    const stream = await resolveWithProviders(target);
    if (!stream) return c.json({ error: "Could not find a playable stream" }, 404);
    const sourceOptions = await getSourceOptionsWithProviders(target);
    return c.json({
      ...proxiedStream(stream, c.req.header("host")),
      sourceOptions
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Scraping failed" }, 502);
  }
});

registerProxyRoutes(app);

export default app;
