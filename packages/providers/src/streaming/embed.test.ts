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

  it("applies VidNest resume to TV episodes", () => {
    const url = createProviderEmbedUrl({
      sourceUrl: "https://vidnest.fun/tv/1/1/1",
      provider: getProviderByKey("vidnest"),
      contentType: "tv",
      resumePositionSeconds: 42
    });
    expect(new URL(url).searchParams.get("progress")).toBe("42");
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

  it("passes saved progress to VidZen using its documented startAt parameter", () => {
    const url = createProviderEmbedUrl({
      sourceUrl: "https://vidzen.fun/movie/1",
      provider: getProviderByKey("vidzen"),
      contentType: "movie",
      resumePositionSeconds: 90
    });
    expect(new URL(url).searchParams.get("startAt")).toBe("90");
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
