import { Hono } from "hono";
import { cors } from "hono/cors";
import downloadsApp from "./downloads";
import { registerProxyRoutes } from "./proxyRoutes";
import { registerScrapeRoute } from "./scrapeRoute";
import type { Bindings } from "./types";

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());
app.route("/api/download", downloadsApp);
registerScrapeRoute(app);
registerProxyRoutes(app);

export default app;
