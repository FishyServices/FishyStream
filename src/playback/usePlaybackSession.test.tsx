import { describe, expect, it } from "vitest";
import { safeSourceUrl } from "./providerDiagnostics";

describe("usePlaybackSession support utilities", () => {
  it("redacts query strings from diagnostic source URLs", () => {
    expect(safeSourceUrl("https://provider.example/embed/1?token=secret")).toBe(
      "https://provider.example/embed/1"
    );
  });
});
