# Providers

Providers api for https://github.com/FishyServices/FishyStream

Works with TMDB, IMDb, and AniList.

## Matching TMDB and IMDb client APIs

TMDB and IMDb expose the same client methods: `getTitle`, `getTitleRating`,
and `getEpisodePage`. Each takes a title-reference object and an optional abort
signal. TMDB references must include a `type` (`"movie"` or `"tv"`), and
TMDB episode references must include `seasonNumber`.

```ts
import { createTMDBClient, createTMDBRequest } from "@fishy/providers/tmdb";

const tmdb = createTMDBClient(createTMDBRequest(apiKey));
const title = await tmdb.getTitle({ id: "550", type: "movie" });
```

## IMDb

`@fishy/providers/imdb` wraps the official IMDb GraphQL API for title ratings and
paginated series episodes. IMDb distributes this API through AWS Data Exchange,
which requires an IMDb subscription, an API key, and AWS SigV4 request signing.

Keep those credentials on the server. Point the browser client at a signed
same-origin proxy:

```ts
import { createIMDbClient, createIMDbProxyRequest } from "@fishy/providers/imdb";

const imdb = createIMDbClient(createIMDbProxyRequest("/api/imdb"));
const rating = await imdb.getTitleRating({ id: "tt0944947", type: "tv" });
```
