# Scraper

`@fishy/scraper` owns provider page resolution, stream extraction, source selection,
and media proxying. It has no React, TSX, or presentation code. The package has
two entry points: the Hono server (`@fishy/scraper`) and a typed client
(`@fishy/scraper/client`) for websites that call that server.

## Use from a website

Run the server alongside your website and configure its origin once. The client
validates scraper responses and keeps route names and query parameters inside
the package.

```ts
import { createScraperClient } from "@fishy/scraper/client";

const scraper = createScraperClient({ baseUrl: "https://scraper.example.com" });
const result = await scraper.scrape(embedUrl, signal);
const stream = result.source;
const options = result.sourceOptions;

const firstOption = options[0];
const selectedStream = firstOption
  ? await scraper.resolveSource(embedUrl, firstOption.key, signal)
  : stream;
```

`ScrapedStream.streamUrl` is a URL served through the scraper's media proxy and
can be passed to any player. `resolveSource` is for providers that expose
multiple servers. Both calls accept an optional `AbortSignal`.

## Run the server

The default export from `@fishy/scraper` is the Hono app. Deploy it with a Bun
server or mount it in a Hono application. It exposes stream resolution,
alternate source resolution, and media proxy routes.

## Known to work

### Anime

- [MegaPlay](https://megaplay.buzz)
- [VidNest](https://vidnest.fun)

### Movies & TV

- [111movies](https://111movies.net)
- [vidZen](https://vidzen.fun)
- [vidLove](https://vidlove.cc)

// not setup yet

## Downloads

The scraper can get downloads from the providers. examples: https://github.com/FishyServices/FishyStream/blob/master/src/ui/components/custom-video-player/downloads.ts
