import { describe, expect, it } from "vitest";
import { createProviderEmbedUrl } from "./embed.js";
import { getProviderByKey } from "./registry.js";

describe("provider embed urls", () => {
  it("applies provider resume parameters", () => {
    const url = createProviderEmbedUrl({
      sourceUrl: "https://peachify.top/embed/movie/1",
      provider: getProviderByKey("peachify"),
      contentType: "movie",
      resumePositionSeconds: 42
    });
    expect(new URL(url).searchParams.get("startAt")).toBe("42");
  });

  it("skips resume for tv on providers that only support movies", () => {
    const url = createProviderEmbedUrl({
      sourceUrl: "https://vidnest.fun/tv/1/1/1",
      provider: getProviderByKey("vidnest"),
      contentType: "tv",
      resumePositionSeconds: 42
    });
    expect(new URL(url).searchParams.has("progress")).toBe(false);
  });

  it("forces the start position for providers that require it", () => {
    const url = createProviderEmbedUrl({
      sourceUrl: "https://vidfast.pro/movie/1",
      provider: getProviderByKey("vidfast"),
      contentType: "movie",
      resumePositionSeconds: 42,
      watchCompleted: true
    });
    expect(new URL(url).searchParams.get("startAt")).toBe("0");
  });

  it("hides episode navigation on tv embeds that support it", () => {
    const url = createProviderEmbedUrl({
      sourceUrl: "https://vidrock.to/embed/tv/1/1/1",
      provider: getProviderByKey("vidrock"),
      contentType: "tv"
    });
    const params = new URL(url).searchParams;
    expect(params.get("nextbutton")).toBe("false");
    expect(params.get("episodeselector")).toBe("false");
  });
});
