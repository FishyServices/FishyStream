# ADR-0001: Package boundaries

## Decision

`@fishy/providers` owns provider catalog policy, playback URL construction, anime mapping, TMDB
integration, and proxy rewriting. The client consumes its public entrypoints instead of reaching
into implementation files.

Convex owns authenticated persistence and synchronization. Cloudflare functions own request
adaptation only.

## Consequences

Provider changes stay local to the provider package, while deployment adapters remain thin. The
package boundary is intentionally independent of the React client and Convex generated code.
