import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolveWithProviders } from "./providers/catalog";
import { registerProxyRoutes } from "./proxy/routes";
import type { ScrapeBindings } from "./types";

const app = new Hono<{ Bindings: ScrapeBindings }>();

app.use("/*", cors());

app.get("/api/scrape", async (c) => {
  const target = c.req.query("url");
  if (!target) return c.json({ error: "Missing url parameter" }, 400);
  try {
    const stream = await resolveWithProviders(target);
    if (!stream) return c.json({ error: "Could not find a playable stream" }, 404);
    const base = `${c.req.header("host")?.includes("localhost") ? "http" : "https"}://${c.req.header("host") ?? "localhost:4000"}`;
    const endpoint = stream.mediaType === "hls" ? "/api/m3u8-proxy" : "/api/media-proxy";
    return c.json({
      streamUrl: `${base}${endpoint}?url=${encodeURIComponent(stream.url)}&headers=${encodeURIComponent(JSON.stringify(stream.headers))}`,
      mediaType: stream.mediaType,
      tracks: stream.tracks ?? null,
      intro: stream.intro ?? null,
      outro: stream.outro ?? null
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Scraping failed" }, 502);
  }
});

registerProxyRoutes(app);

export default app;
