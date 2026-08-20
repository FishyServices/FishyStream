# Architecture map

FishyStream has four practical module groups.

## App and UI

`src/app/` starts the React tree, authentication, Convex, routing, settings, and analytics. `src/pages/` composes route-level views. `src/ui/components/` renders reusable views such as cards, rows, the content detail modal, and video players.

## Catalog

`src/features/catalog/queries/` reads TMDB and IMDb data through `packages/providers/`, normalizes provider results into shared content types, and serves discovery hooks. `src/features/catalog/model/` holds catalog-facing types and policy.

## Playback

`src/features/playback/` owns the playback session and diagnostics. `packages/providers/src/playback/` resolves stream sources, groups providers, chooses a source, and builds embed URLs. `src/ui/components/VideoPlayer.tsx` and `CustomVideoPlayer.tsx` consume the session.

## Viewer state

`src/features/library/` owns React access to watchlist, history, and progress. `convex/domains/` owns the persisted signed-in state. `src/shared/storage/` owns device-only settings, folders, and caches.

## Seam rules

- Keep provider-specific URL and response details behind `packages/providers/`.
- Keep Convex function details behind library hooks.
- Keep browser storage behind storage modules.
- A seam earns its cost when two adapters or two test implementations need the same interface.
- Tests should cross the module interface. Helpers stay private unless callers need them.

For current file ownership, inspect the source tree and package scripts. This map records reasons and seams, not a second copy of every export.
