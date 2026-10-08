---
name: provider-scraping
description: Use when adding or repairing a streaming provider so the scraper returns a playable HLS playlist or video file.
---

# Add a playable provider

Use this skill when a provider appears in the catalog but the scraper does not return a stream, or when you are adding a new provider.

Some provider tasks use a reduced workspace containing only `packages/scraper`
and `packages/providers/src/catalog/providerRegistry.ts`. When the wider
repository or upstream reference code is unavailable, use the existing
resolver contracts, neighboring resolvers, tests, and registry as the source
of truth. Do not invent missing protocol details; leave the provider disabled
until its behavior is verified.

## Read the ownership docs

Read these files before changing provider or scraper code:

- `docs/PRODUCT.md`
- `docs/CONTEXT.md`
- `docs/architecture/README.md`

Keep provider URL and response details in provider-facing code. Keep playback output in `StreamResult` form so `CustomVideoPlayer.tsx` can consume it through the existing proxy.

## Know the resolver layout

Inspect `packages/scraper/src/resolvers/` first and follow what is there. The structure is:

- `contracts.ts`: `makeResolver`, `Resolver`, `ResolverOutput`. A resolver returns `{ streams, embeds }`.
- `all.ts`: the registry. `resolverSources` is the explicit, ordered array; `resolverEmbeds` holds nested-embed resolvers.
- `runner.ts`: `runResolvers` tries enabled sources in array order, then nested embeds. It catches a throwing resolver and continues.
- `providerResolverBase.ts` / `httpFetcher.ts`: shared `browserHeaders`, `fetchProviderJson`, `resolveProviderStream`, `resolveSubtitleTracks`.
- `providerResolvers.ts`: a barrel that re-exports resolvers. It is not where new resolver code goes.
- One `<provider>Resolver.ts` and one `<provider>Resolver.test.ts` per provider.
- `../media.ts`: `resolveMediaCandidate`, `getMediaType`, `isFetchableUrl`, `getOriginHeaders`, `isRecord`. Reuse these instead of rewriting URL or media-type logic.

## Find the provider protocol

Work out the real protocol before writing code. Do not guess endpoints, selectors, or crypto constants.

1. Inspect the provider with direct HTTP requests before writing a browser resolver, when the environment allows it.
2. Fetch a known movie URL and a known TV episode URL.
3. Record the status, redirects, content type, cookies, and required `Referer` or `Origin` headers.
4. Identify the request that returns a source object, an embed URL, an HLS playlist, or a video file.
5. Follow redirects and nested source APIs until you reach a real media URL.
6. Check whether the media URL needs the provider's headers or cookies.

Use the p-stream provider (C:\Users\Administrator\Downloads\Files\p-stream /providers and /simple-proxy) flow as a model: a provider adapter resolves its own API and embed steps, then returns a direct stream. Do not copy selectors or endpoint assumptions from another provider.

### When you cannot reach the provider

The authoring sandbox may block provider hosts (the egress proxy answers `403` with `x-deny-reason: host_not_allowed`). Then use open-source reference adapters:

- Prefer `raw.githubusercontent.com/<org>/<repo>/<branch>/<path>` with `curl`. `github.com` pages are refused to automated fetchers by robots rules, and unauthenticated `api.github.com` is rate-limited.
- Search snippets and old mirrors are not enough. Read the actual adapter and its crypto helper end to end.
- Check how recent the reference is. Look at the repo's changelog or releases for words like "removed", "no longer valid", or "rotated". Provider crypto constants change, and a stale reference produces a resolver that looks correct and never works.
- If you cannot confirm the current protocol, say so and stop. Do not invent constants, and do not ship a decoder you cannot test against real ciphertext.
- Reference adapters usually have observations worth keeping, such as per-CDN `Referer` rules. Keep them in the resolver as an explicit table and mark them unverified in the notes.

## Add the catalog entry

Edit `packages/providers/src/catalog/providerRegistry.ts`.

Set `canBeScraped: true` only when the scraper has a tested resolver for the provider. Keep the provider entry when scraping is disabled. For example, VixSrc keeps its paths and metadata but omits `canBeScraped`.

Confirm the entry has the correct:

- `key`, `website`, and `idType`.
- `moviePath` and `tvPath`.
- `referrerPolicy`, server parameters, and progress parameters.

Use the same URL shape that the playback source builder sends to `packages/scraper/src/scrapeRoute.ts`. The resolver's URL parser must accept exactly the shapes `moviePath` and `tvPath` produce.

The flag is a one-line edit. Make it last, after the resolver tests and type check pass. Two rules govern it:

- Mocked unit tests count as "tested resolver coverage" for the diff check below, but they do not prove playback.
- If the person explicitly asks for the flag before real playback has been proven, set it, and record "real playback not run" and why in the change notes. Do not present the provider as working.

## Implement the resolver

Add one provider resolver file in `packages/scraper/src/resolvers/`. Split a large resolver into a nearby module. Keep one provider adapter per file.

The resolver must:

1. Return `null` for unrelated URLs, and make no network call to do so.
2. Parse and validate the movie or TV path. Check the hostname exactly, validate the ID shape accepted by that provider, and require a season and episode for TV. Convert IMDb IDs to numeric TMDB IDs only when the provider requires it.
3. Fetch the provider API or page with the required headers.
4. Validate external JSON before reading fields from it. Treat every field as `unknown`.
5. Resolve relative URLs against the response origin. Pass that origin as the base to `resolveMediaCandidate`.
6. Return a `StreamResult` with `url`, `mediaType`, and request headers.
7. Return `mediaType: "hls"` for an HLS playlist and `mediaType: "file"` for MP4 or WebM.
8. Preserve subtitle tracks only when the provider returns valid track URLs.
9. Resolve IMDb IDs (`tt...`) to TMDB IDs when the provider API needs numeric TMDB IDs. A TMDB miss returns `null` before any provider call.

Prefer direct `fetch` calls. Resolver modules must not import Puppeteer, `launchBrowser`, or the browser fetcher. Browser interception belongs outside `packages/scraper/src/resolvers` and is temporary migration fallback only.

Do not add resolver ranks. Provider order is the explicit array order in the resolver registry. This keeps the execution order visible and avoids a second ordering system. The same rule applies inside a resolver: upstream server order is an explicit array.

Use the p-stream shape for provider composition:

- A source resolver accepts the requested provider URL and returns direct streams or embed references.
- An embed resolver accepts a nested URL and returns direct streams.
- A multi-provider source tries its own upstream provider list and returns the first valid stream.
- One failed provider or embed must not abort the remaining providers.

Do not delete an existing provider adapter because a live endpoint is temporarily rate-limited or unavailable. Preserve the adapter, its tests, and its catalog entry, then record the external failure separately.

Do not disable TLS verification globally. Do not return an embed page as a playable media URL. `CustomVideoPlayer.tsx` needs a media URL that the HLS or file proxy can fetch.

### Patterns that worked

**Never reject.** Guard URL parsing and the whole resolver workflow so the public resolver returns `null` for provider failures. Individual upstream attempts may throw internally only when the resolver catches them; the caller must never receive a rejection.

**Timeouts.** Give every request an `AbortController` timeout, and keep the timer running until the body has been read, not just until headers arrive. Make the timeout injectable or otherwise easy to shorten in tests. If a resolver exposes test options, the registry must still call it with only the URL.

**Ordered fallback.** Keep server selection deterministic. You may run attempts sequentially in array order, or start them concurrently and inspect results in array order; every attempt must resolve to `null` rather than reject. Do not let an earlier slow attempt make a later valid result unusable:

```ts
const attempts = SERVER_IDS.map((id) => resolveServer(id)); // each attempt never rejects
for (const attempt of attempts) {
  const stream = await attempt;
  if (stream) return stream;
}
return null;
```

Do not use a bare `Promise.all` over sources. One timeout or HTTP 429 must be a normal miss.

**Validate media before returning it.** A type hint such as `"hls"` on an arbitrary URL is not proof of media. Fetch what the proxy will fetch, with the headers the proxy will send, and require real content:

- HLS: status is OK and the body, after stripping a BOM, starts with `#EXTM3U`.
- File: send `Range: bytes=0-1023`; accept `200` or `206` and reject `text/*`, HTML, JSON, or XML content types.
- Cancel the body you do not read.

If the probe fails, treat it as a miss for that link and continue. This is what stops embed pages and error bodies from becoming a `StreamResult`.

**Reject known demo media** such as `/demo-video.mp4` before probing.

**Headers.**

- Send `User-Agent`, `Origin`, and `Referer` with stream requests. Do not forward the API call's `Accept: application/json` to media requests.
- If a CDN needs a specific `Referer` and `Origin`, keep that in a small explicit function keyed by hostname, and match the hostname rather than searching the whole URL.
- Empty stream headers are valid. The proxy derives `Origin` and `Referer` from the playlist URL when the headers carry neither. Probe with the same derived headers (`getOriginHeaders`) so you test what the proxy will send.

**Subtitles.** Map provider tracks into the shape `scrapeRoute.ts` proxies: objects with a `file` URL. Resolve relative URLs, drop non-`http(s)` URLs such as `javascript:`, de-duplicate by URL, take tracks only from the server that produced the winning stream, and omit the `tracks` property when none are valid.

**Crypto typing (TypeScript 7 and `lib.dom`).** With TypeScript 7, or any config that includes `lib.dom`, `crypto.subtle` only accepts byte arrays backed by a plain `ArrayBuffer`. A helper declared as returning `Uint8Array` yields `Uint8Array<ArrayBufferLike>` and fails with TS2769 or TS2322 (`not assignable to BufferSource`). Declare helpers that feed WebCrypto as `Uint8Array<ArrayBuffer>`:

```ts
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  /* ... */
}
```

Go through every helper that decodes bytes for `crypto.subtle`, not just the one the compiler names first. This passes on TypeScript 6 without the DOM lib, so the error can first appear in the maintainer's environment.

**Secrets and constants.** Put provider crypto seeds in named constants with a comment saying they can rotate, and make a decrypt failure return `null`, not throw. Do not export or edit another provider's file just to share a constant; note the duplication instead.

## Wire the resolver into the route

The route already runs the registry. `packages/scraper/src/scrapeRoute.ts` calls `runResolvers(targetUrl, { sources: resolverSources, embeds: resolverEmbeds })` before `page.goto`. Adding a provider therefore needs only:

1. Append a `makeResolver({ id, name, resolve })` entry to `resolverSources` in `all.ts`. Appending keeps existing order unchanged.
2. Export the resolver from `providerResolvers.ts`.
3. Leave `scrapeRoute.ts` alone unless the route itself is wrong. Say in the notes that it needed no edit.

The route's order stays:

1. Try the dedicated direct resolvers via `runResolvers`.
2. If none returns a stream, use the existing browser interception path.
3. Convert the selected stream to `/api/m3u8-proxy` or `/api/media-proxy` with `buildProxyUrl`.

Do not let a failed dedicated resolver abort the generic fallback while other providers are still being migrated. A resolver should catch provider-specific network, parsing, timeout, and decryption failures and return `null`; the runner continues to the next provider. Once every provider has a tested direct adapter, remove the generic browser fallback from the route.

For dynamic providers, discover upstream provider IDs from the provider's loaded bundle or API response. Do not hard-code a subset of provider names when the site exposes its current list dynamically. Pass the page `Referer` and `Origin` when fetching those bundles.

For multi-provider sites, try sources independently. A timeout or HTTP 429 from one source is a normal miss; it must not reject `Promise.all` for every source. Use `Promise.allSettled` or catch errors inside each source attempt when parallelizing.

## Test the resolver

Add unit tests beside the resolver, in `packages/scraper/src/resolvers/`, named `<provider>Resolver.test.ts`. Follow the imports the existing tests use (`vitest`, which Bun aliases at runtime).

Cover these cases:

- A movie URL returns an HLS or file `StreamResult`.
- A TV URL includes the correct season and episode (assert the exact request URL).
- An IMDb ID is converted before the provider call, and a TMDB miss makes no provider call.
- Relative source URLs become absolute.
- Required `Referer`, `Origin`, or cookie headers are preserved, including any per-CDN rules.
- An unrelated provider URL returns `null` with no network call. Include a wrong host, a wrong path, a non-numeric ID, and a TV URL missing the episode.
- Malformed or unavailable provider responses return `null`: a key endpoint failure, a garbage key, empty servers, non-JSON bodies, and wrong-shaped JSON.
- A multi-provider source continues after a thrown fetch, a timeout, HTTP 429, a malformed payload, a decryption failure, and a fake-media link, and then returns the next working source.
- An embed page or demo URL is rejected and never becomes a `StreamResult`. Assert the demo URL is never even fetched.
- Subtitle tracks are filtered and de-duplicated, and omitted when empty.
- A nested source-to-embed handoff invokes the correct embed resolver.
- A disabled resolver is not called.
- The registry array order is exactly as expected and has no rank field.
- The resolver directory has no Puppeteer or `launchBrowser` reference (read non-test `.ts` files; exclude tests, which mention the words).

Test techniques that made the suite trustworthy:

- **Route the fetch mock by URL**, not by call order. Parallel servers make `mockResolvedValueOnce` chains flaky. Use `vi.spyOn(globalThis, "fetch").mockImplementation(...)` with a handler keyed on the URL, and return `404` for anything unrouted.
- **Honor `init.signal` in the timeout mock** and pass a small `timeoutMs`, so the real timeout path runs in tens of milliseconds.
- **Encrypt fixtures locally with the same scheme the resolver decrypts**, so decryption is exercised for real. Also include ciphertext sealed with a wrong key and a wrong seed.
- **Mutation-check the suite.** Temporarily break the resolver in targeted ways (skip the media probe, use a wrong seed, drop the demo filter, drop TV params, drop the relative base, drop the hostname check), confirm each one fails tests, then restore the file and diff to prove it is unchanged. A suite that passes on the first run has not yet proven it can fail.

Mock unit-test network responses. Do not treat a mocked `200` as proof that playback works. Tests with locally encrypted fixtures prove the code matches the documented protocol, not that the provider still behaves that way.

## Prove real playback

Use a real provider URL and verify the full media chain:

1. Call `/api/scrape?url=...`.
2. Confirm the response contains a local proxy URL and the correct media type.
3. Fetch the returned M3U8 proxy URL.
4. Confirm the body contains `#EXTM3U` and at least one `#EXTINF` or child playlist reference.
5. Resolve and fetch one child playlist when the response is a master playlist.
6. Fetch the first media segment or a small byte range from the file URL.
7. Confirm the response is non-empty and has a video or MPEG-TS content type.

Record the provider URL, the media type, the playlist status, the first segment status, and any required headers in the change notes. A scraper is complete only when a real playlist or file reaches the media proxy and contains video data.

When real verification is blocked, distinguish code failure from upstream failure from environment failure:

- Upstream: VidLux may return HTTP 429 for every discovered backend. This proves the resolver reached the provider but does not prove playback. Do not replace that failure with a hard-coded backend or remove the provider adapter.
- Environment: a sandbox that blocks the provider host (`host_not_allowed`) proves nothing about the resolver in either direction. Write "real playback not run" and the reason in the notes, and give the person the exact commands to run where the provider is reachable.

Never write "works", "verified", or "playable" for a provider whose real playback was not run.

Known migration lessons:

- VidLux exposes its backend IDs in a JavaScript bundle. Fetching those bundles without the page `Referer` can return 403, while backend requests can independently return 429 or abort on timeout.
- VidNest uses several upstream APIs and encrypted JSON responses. Keep its multi-provider adapter intact while its decoder or upstream protocol is being verified; do not delete it after a failed live probe.
- VidRock exposes a direct API at `https://vidrock.net/api/movie/:id` and `https://vidrock.net/api/tv/:id/:season/:episode`. Each returned source URL is base64url-encoded AES-GCM data: the first 12 bytes are the IV and the remaining bytes contain ciphertext plus the authentication tag. The client key is the hex string shipped by VidRock's player bundle. Decrypt each source independently and continue when one source is invalid.
- VidRock's API requires TMDB numeric IDs even though its catalog accepts both TMDB and IMDb IDs. Resolve `tt...` IDs through TMDB before calling VidRock. Reject known provider demo URLs such as `/demo-video.mp4`; demo media must never become a `StreamResult`.
- VidZee (`player.vidzee.wtf`) uses a two-stage scheme, taken from the cinepro-org/core adapter and not yet proven against the live site:
  - `GET https://core.vidzee.wtf/api-key` returns base64 of `iv[12] | tag[16] | ciphertext`. AES-256-GCM under SHA-256 of a hardcoded seed decrypts it to the link key. WebCrypto wants `ciphertext | tag`, so reorder before decrypting.
  - `GET https://player.vidzee.wtf/api/server?id=<tmdb>&sr=<0..13>` plus `&ss=<season>&ep=<episode>` for TV returns `{ url: [{ link, type }], tracks: [{ lang, url }] }`.
  - Each `link` is base64 of `<base64 iv>:<base64 ciphertext>`, AES-256-CBC, with the link key UTF-8 encoded and zero-padded or truncated to 32 bytes.
  - Some CDNs want specific headers: `fast33lane` hosts use `rapidairmax.site` as Referer and Origin, and `serversicuro.cc` hosts use none.
  - Another project removed its VidZee adapter on 2026-05-29 because an older hardcoded seed stopped working. The seed can rotate again. When it does, the resolver must return `null` and the route falls back; refresh the seed from the player bundle.
- `StreamResult` must contain a real HLS playlist URL or video-file URL. An embed page URL is not playable by `CustomVideoPlayer.tsx`.

## Validate the change

Run the repository's standard checks:

```text
bun test ./packages/scraper/src
bun run lint
```

`bun test` on the whole `packages/scraper/src` directory catches regressions in other providers. A single-file command such as `bun test ./packages/scraper/src/providerResolvers.test.ts` is not enough; the old path no longer exists because tests now live in `resolvers/`.

If `bun run lint` fails because the local environment cannot resolve the TypeScript binary, report that environment failure separately from resolver test results. Use the workspace TypeScript check with `bunx --bun tsc --noEmit -p packages/scraper/tsconfig.json` when available.

Type-check on the compiler the maintainer actually runs, not only the one in your sandbox:

- The repo's lint has reported errors that only appear on TypeScript 7.0.2 with `lib.dom` (see the crypto typing note above). Install TypeScript 7 in a scratch directory (`npm i typescript@7.0.2`) and run it with a temporary config that extends the package config and adds `"lib": ["ESNext", "DOM"]`.
- If a person pastes lint output, reproduce it first, fix the cause, then confirm it is gone on TypeScript 6 and 7, with and without DOM.
- An error in an existing file that shares the cause and blocks lint may be fixed with the smallest type-only change. Say so in the notes and keep the diff to that one line.

Known environment gap: test files import `vitest`, which is not in `package.json`, so a plain `tsc` reports `TS2307` for every test file. That is an existing condition, not a regression. To confirm your own test file type-checks, temporarily add `declare module "vitest" { export * from "bun:test"; }` in a throwaway `src/__vitest_shim.d.ts`, run the check, then delete it. Confirm the file is gone afterwards.

Finish with hygiene checks:

- Diff the working tree against the original upload. Confirm only the intended files changed, nothing was deleted, and `canBeScraped` changed only for the provider you built. Never add VixSrc to the scrapeable set unless explicitly requested and fully verified.
- Remove temporary configs, shims, and scratch installs.
- Preserve each file's line endings. Several files here mix CRLF and LF; edit with a tool that does not normalize them, and check the diff shows only your lines.
- Some sandbox shells are plain `sh`. Use `bash -c` when a command needs `PIPESTATUS`, process substitution, or arrays, and check exit codes explicitly rather than trusting empty output.
- `bun` may be missing from a fresh sandbox. Install it with `npm i -g bun`. Install project dependencies with `--ignore-scripts` so the Puppeteer `postinstall` does not try to download Chrome.

## Write the change notes

End with notes that record, at minimum:

- Files added, edited, and deliberately left untouched.
- The protocol implemented and where it came from.
- A verification table: tests run and counts, mutation check result, type-check results per compiler and config, and real playback (run or not run, and why).
- The provider URL, media type, playlist status, and first segment status, if real playback was run.
- Known risks, such as crypto seeds that can rotate and constants duplicated from another resolver.
- Exact commands to prove real playback where the provider is reachable, and what to do with `canBeScraped` if they fail.
