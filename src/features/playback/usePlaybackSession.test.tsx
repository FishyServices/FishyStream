import { describe, expect, it } from "vitest";
import { safeSourceUrl } from "./model/providerDiagnostics";
import { getEffectiveAnimeDub, setAnimeDubSearchParam } from "./usePlaybackSession";

describe("usePlaybackSession support utilities", () => {
  it("redacts query strings from diagnostic source URLs", () => {
    expect(safeSourceUrl("https://provider.example/embed/1?token=secret")).toBe(
      "https://provider.example/embed/1"
    );
  });

  it("uses the saved dub preference when the URL has no override", () => {
    expect(getEffectiveAnimeDub(new URLSearchParams(), true)).toBe(true);
    expect(getEffectiveAnimeDub(new URLSearchParams("dub=false"), true)).toBe(false);
    expect(getEffectiveAnimeDub(new URLSearchParams("dub=true"), false)).toBe(true);
  });

  it("keeps an explicit sub choice when dub is the saved default", () => {
    const params = new URLSearchParams();
    setAnimeDubSearchParam(params, false, true);
    expect(params.get("dub")).toBe("false");

    setAnimeDubSearchParam(params, true, true);
    expect(params.get("dub")).toBe("true");
  });
});
