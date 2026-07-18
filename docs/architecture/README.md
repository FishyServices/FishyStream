# FishyStream architecture

FishyStream is organized around feature modules and explicit seams.

## Dependency direction

```text
pages / UI
  -> feature queries and model modules
  -> shared domain types and navigation
  -> provider, Convex, storage, and runtime adapters
```

Pages and UI modules must not import provider implementation files, generated Convex files,
or browser storage directly. Feature modules own those integrations through narrow interfaces.

The `shared/content` module is the cross-runtime content domain. It contains wire-compatible
types and conversions used by the browser and Convex. Generated Convex files are framework
outputs and must never be edited by hand.

The `@fishy/providers` package owns external catalog, playback, anime mapping, and proxy policy.
The edge functions only adapt runtime requests to the provider proxy seam.

## Naming

- `model`: domain types and pure policy.
- `queries`: async data acquisition and query orchestration.
- `persistence`: storage adapters and synchronization.
- `ui`: feature-specific presentation.
- `adapter`: runtime or external-system implementation of a seam.

Avoid broad barrel exports. Public package exports are limited to the package root and the
catalog, playback, anime, proxy, and TMDB entrypoints.
