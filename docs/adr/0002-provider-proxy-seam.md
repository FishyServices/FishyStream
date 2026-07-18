# ADR-0002: Provider proxy seam

## Decision

Provider proxy implementations satisfy `ProviderProxyAdapter`. Path matching and provider-specific
rewriting remain in the provider package; Vite and Cloudflare only dispatch requests through the
shared proxy interface.

## Consequences

The same proxy behavior can be tested in isolation and used by development and production
runtimes without duplicating HLS or embed rewriting policy.
