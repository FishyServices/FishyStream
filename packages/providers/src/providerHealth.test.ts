import { describe, expect, it } from "vitest";
import { markProviderFailure, markProviderSuccess, rankSources } from "./providerHealth";
import type { StreamSource } from "./providerCatalog";

const sources: StreamSource[] = [
  { key: "a", name: "Alpha", url: "https://a.example/embed" },
  { key: "b", name: "Beta", url: "https://b.example/embed" },
  { key: "c", name: "Gamma", url: "https://c.example/embed" }
];

describe("providerHealth", () => {
  it("ranks explicit initial source before default provider", () => {
    const ranked = rankSources(sources, { initialSource: "Gamma", defaultProvider: "b" });

    expect(ranked.map((source) => source.key)).toEqual(["c", "b", "a"]);
  });

  it("moves recently failed providers behind healthy sources", () => {
    const failed = markProviderFailure("a", "iframe failed", undefined, Date.now());
    const ranked = rankSources(sources, { health: [failed] });

    expect(ranked.at(-1)?.key).toBe("a");
  });

  it("resets failure count after success", () => {
    const failed = markProviderFailure("a", "timeout", undefined, 100);
    const success = markProviderSuccess("a", failed, 200);

    expect(success.failureCount).toBe(0);
    expect(success.lastSuccessAt).toBe(200);
  });
});
