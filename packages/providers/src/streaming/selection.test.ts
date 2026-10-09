import { describe, expect, it } from "vitest";
import { groupSourcesByProviderCategory, pickPreferredSource } from "./selection.js";
import type { StreamSource } from "./types.js";

const defaultServer = { id: "default", label: "Default" };

describe("source selection", () => {
  it("honors an explicit source before the automatic direct fallback", () => {
    const sources: StreamSource[] = [
      { key: "direct", name: "Direct", url: "https://direct.example", server: defaultServer },
      { key: "megaplay", name: "MegaPlay", url: "https://megaplay.example", server: defaultServer }
    ];
    expect(pickPreferredSource(sources, { initialSource: "MegaPlay" })?.key).toBe("megaplay");
    expect(pickPreferredSource(sources, {})?.key).toBe("direct");
    expect(pickPreferredSource([], {})).toBeUndefined();
  });

  it("keeps server variants under one provider", () => {
    const groups = groupSourcesByProviderCategory([
      { key: "megaplay", name: "Default", url: "https://m.example", server: defaultServer },
      {
        key: "megaplay",
        name: "BCDN",
        url: "https://m.example?s=bcdn",
        server: { id: "bcdn", label: "BCDN", value: "bcdn" }
      },
      {
        key: "megaplay",
        name: "TCDN",
        url: "https://m.example?s=tcdn",
        server: { id: "tcdn", label: "TCDN", value: "tcdn" }
      }
    ]);
    expect(
      groups.find((group) => group.key === "primary_anime")?.providers[0]?.sources
    ).toHaveLength(3);
  });
});
