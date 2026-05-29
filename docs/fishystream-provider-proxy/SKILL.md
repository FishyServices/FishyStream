---
name: fishystream-provider-proxy
description: Add or update FishyStream streaming provider proxy support using packages/providers/src/providerProxy.ts, providerCatalog.ts, vite.config.ts, and api/[[path]].ts. Use when the user asks to add a new provider URL/proxy, fix CORS/HLS/proxied embed playback, route provider traffic away from Convex, or make another provider work like VidPlays.
---

# FishyStream Provider Proxy

## Quick Workflow

1. Inspect the current provider entry in `packages/providers/src/providerCatalog.ts`.
2. Route proxied providers through a non-Convex prefix such as `/<provider>-proxy`.
3. Add the prefix to `PROVIDER_PROXY_PREFIXES` in `packages/providers/src/providerProxy.ts`.
4. Add a provider branch in `proxyProviderRequest`.
5. Reuse the existing helper patterns:
   - rewrite embed HTML so absolute `/player.js` or `/api/...` URLs stay under the proxy prefix
   - strip broken caption arrays before the iframe renders `<track>` elements
   - unwrap provider wrapper URLs to their inner HLS URL when needed
   - rewrite HLS playlists so nested playlists and segments route back through the proxy
6. Ensure `vite.config.ts` delegates dev requests to `proxyProviderRequest`.
7. Ensure `api/[[path]].ts` delegates deployment/function requests to `proxyProviderRequest` and does not let provider proxy traffic fall through to Convex.
8. Run `bun run lint` and usually `bun run build`.

## File Responsibilities

- `packages/providers/src/providerCatalog.ts`: provider base `website`, URL builders, selected provider metadata.
- `packages/providers/src/providerProxy.ts`: reusable proxy registry, provider-specific proxy handlers, HLS playlist rewriting.
- `packages/providers/src/playerProviders.ts`: player postMessage parsing, progress events, and provider-specific iframe URL behavior.
- `packages/providers/src/providerPlayback.ts`: source grouping/selection, anime playback gates, and next-episode helpers.
- `vite.config.ts`: local dev middleware only; it should not duplicate provider logic.
- `api/[[path]].ts`: deployment function catch-all; normalize provider proxy paths before forwarding all other `/api/*` traffic to Convex.
- `src/components/VideoPlayer.tsx`: only add provider-specific embed query params or iframe behavior here when it cannot live in the catalog/proxy.

## Patterns

Provider catalog entry for a proxied provider:

```ts
website: "/example-proxy",
moviePath: (id) => `/embed/movie/${id}`,
tvPath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`
```

Shared proxy registration:

```ts
const PROVIDER_PROXY_PREFIXES = ["vidplays-proxy", "example-proxy"] as const;
```

Provider dispatch:

```ts
if (match.prefix === "example-proxy") {
  return proxyExampleRequest({ url, subpath: match.subpath, method, headers, body });
}
```

HLS responses: if the upstream returns a valid playlist with a bad status, normalize proxied playlist responses to `200`. HLS.js treats HTTP status as authoritative.

## Guardrails

- Do not put provider proxies under `/api` in dev. Vite proxies `/api` to Convex.
- Do not duplicate proxy logic between `vite.config.ts` and `api/[[path]].ts`; put it in `packages/providers/src/providerProxy.ts`.
- Preserve the actual request host in dev middleware with `new URL(req.url ?? "/", \`http://${req.headers.host ?? "localhost"}\`)`.
- Do not use iframe sandboxing to fix provider CORS unless tested; module scripts can become `Origin: null` and fail.
- Prefer removing or rewriting broken subtitles before the remote player creates `<track>` tags. PostMessage calls are often too late.
- Use structured URL parsing (`new URL`, `URLSearchParams`) for wrapper URLs and playlist-relative paths.

## Validation

Run:

```bash
bun run lint
bun run build
```

For runtime checks, restart Vite after changing `vite.config.ts` or `packages/providers/src/providerProxy.ts`; middleware code is loaded at server startup.
