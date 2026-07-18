import { describe, expect, it } from "vitest";
import { matchProviderProxyPath, resolveProviderProxyPathFromSegments } from "./providerProxy.js";

describe("providerProxy", () => {
  it("matches known provider proxy prefixes", () => {
    expect(matchProviderProxyPath("/vidplays-proxy/embed/movie/1")).toEqual({
      prefix: "vidplays-proxy",
      subpath: "embed/movie/1"
    });
  });

  it("resolves provider path aliases", () => {
    expect(resolveProviderProxyPathFromSegments(["vidplays", "embed", "movie", "1"])).toBe(
      "/vidplays-proxy/embed/movie/1"
    );
  });
});
