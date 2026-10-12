# Scraper provider prompts

Use these prompts as a starting point. Replace `[provider]` and include the failing page URL, content type, and movie or episode IDs when you have them. Keep provider details in the scraper adapter; the provider catalog owns source metadata and capabilities.

## Investigation notes

- Start with the current adapter and neighboring implementations under `packages/scraper/src/providers/catalog/`, then check registration in `packages/scraper/src/providers/catalog.ts` and provider metadata in `packages/providers/src/streaming/providers.ts`.
- Trace the complete player flow: page HTML, referenced JavaScript bundles, API requests, response parsing or decryption, and the final media request. Record request order, method, status, content type, redirects, and required `Referer` or `Origin` headers. A successful API response alone does not prove a playable stream.
- When JavaScript discovers provider names or endpoints, derive them from the fetched page, bundle, or API response instead of relying on a hard-coded list that can go stale. Reimplement only the required behavior; do not copy whole reference repositories or files into this project.
- Resolve relative media URLs against the correct page or response URL. Preserve headers needed by the media host and pass the final stream through the scraper's existing proxy flow.
- Log useful stages and failure causes (request/status, parse or decrypt failure, and playback probe result). Avoid logging full signed URLs, tokens, or other credentials; log the host and path instead.

## Verification checklist

- Try at least one real movie and one real episode, including the relevant season and episode identifiers.
- Confirm the resolver returns a media URL rather than an embed page, and that the URL works through the scraper proxy. For HLS, fetch the playlist and confirm it contains `#EXTM3U`; if it is a master playlist, check a child playlist too. Check a media segment or file response where practical.
- Distinguish provider failures from blocked or expired upstream URLs, unsupported response formats, and proxy/header problems in the logs. Do not mark a provider as scrape-capable until its adapter has been verified.
- Run `bun run lint` after code changes.

## Fix a provider

> Fix the `[provider]` scraper in `packages/scraper`. Reproduce the failure with the supplied movie or episode IDs and a known working player page. Trace its HTML, JavaScript, API requests, response parsing, and media request to find the failing step. Add stage logs that explain request and parsing failures without printing signed URL tokens. Correct the adapter, then verify the returned playlist or file through the scraper proxy for a movie and an episode. Run `bun run lint`. Do not return an embed page or an unverified URL as a stream.

## Add a provider

> Add `[provider]` as a working scraper provider. Inspect its live player HTML, JavaScript bundles, and API behavior to discover how it selects and resolves sources. Implement a small adapter following the existing `packages/scraper/src/providers/catalog/` patterns; register it in the scraper catalog and provider metadata, and enable scrape capability only after it works. Verify a real movie and episode stream through the proxy, including playlist and media requests where practical, then run `bun run lint`. Reimplement only the needed behavior; do not copy or add whole files from reference repositories.
