# Providers

Provider package for https://github.com/FishyServices/FishyStream. Covers TMDB, IMDb, AniList, Jikan, Tsuzuki, OpenSubtitles, TheIntroDB, and the embed stream providers.

## Layout

| Path                             | Contents                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `metadata/tmdb`, `metadata/imdb` | Metadata clients sharing the `MetadataClient` interface                       |
| `anime`                          | AniList resolver and catalog, Jikan, Tsuzuki, episode mappings, filler lookup |
| `ordering`                       | Canonical season ordering overrides and direct video urls                     |
| `streaming`                      | Provider registry, source building, embed urls, source selection              |
| `playback`                       | Player messages, controls, progress and episode policies, TheIntroDB          |
| `subtitles`                      | OpenSubtitles search and request handler                                      |

## Metadata

```ts
import { tmdb } from "@fishy/providers/metadata";

const client = tmdb.createTMDBClient(tmdb.createTMDBRequest(apiKey));
const title = await client.getTitle({ id: "550", type: "movie" });
const results = await client.search("fight club", "movie");
```

IMDb uses the same base methods and needs a signed same-origin proxy:

```ts
import { imdb } from "@fishy/providers/metadata";

const client = imdb.createIMDbClient(imdb.createIMDbProxyRequest("/api/imdb"));
const rating = await client.getTitleRating({ id: "tt0944947", type: "tv" });
```

## Streaming

```ts
import { buildTvSources, pickPreferredSource } from "@fishy/providers/streaming";

const sources = await buildTvSources({
  tmdbId: "1399",
  imdbId: "tt0944947",
  season: 1,
  episode: 1
});
const source = pickPreferredSource(sources, { defaultProvider: "auto" });
```

Use `createSourceBuilder` to inject the TMDB and AniList lookups.

## Scripts

`npm run lint` type-checks, `npm test` runs the suite, `npm run build` emits `dist`. Set `PROVIDER_CONNECTIVITY=1` to also probe every provider over the network.
