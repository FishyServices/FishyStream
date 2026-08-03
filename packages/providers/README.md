# Providers

Providers api for https://github.com/FishyServices/FishyStream

works with tmdb and anilist

## IMDb

`@fishy/providers/imdb` wraps the official IMDb GraphQL API for title ratings and
paginated series episodes. IMDb distributes this API through AWS Data Exchange,
which requires an IMDb subscription, an API key, and AWS SigV4 request signing.

Keep those credentials on the server. Point the browser client at a signed
same-origin proxy:

```ts
import { createIMDbClient, createIMDbProxyRequest } from "@fishy/providers/imdb";

const imdb = createIMDbClient(createIMDbProxyRequest("/api/imdb"));
const rating = await imdb.getTitleRating("tt0944947");
```
