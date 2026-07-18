import { describe, expect, it } from "vitest";
import {
  createProviderEmbedUrl,
  isTrustedPlayerMessageOrigin,
  parsePlayerMessage
} from "./playerProviders.js";

describe("playerProviders", () => {
  it("parses trusted player event payloads", () => {
    const payload = parsePlayerMessage(
      {
        type: "PLAYER_EVENT",
        data: {
          event: "timeupdate",
          currentTime: 50,
          duration: 100,
          mediaType: "movie"
        }
      },
      "https://peachify.top"
    );
    expect(payload?.data.progress).toBeUndefined();
    expect(payload?.data.currentTime).toBe(50);
  });

  it("rejects untrusted origins unless they match the active iframe origin", () => {
    expect(isTrustedPlayerMessageOrigin("https://evil.example")).toBe(false);
    expect(isTrustedPlayerMessageOrigin("https://local.example", "https://local.example")).toBe(
      true
    );
  });

  it("applies provider resume parameters", () => {
    const url = createProviderEmbedUrl({
      sourceUrl: "https://peachify.top/embed/movie/1",
      provider: {
        key: "peachify",
        origins: ["https://peachify.top"],
        progress: { resumeParam: "startAt" }
      },
      contentType: "movie",
      resumePositionSeconds: 42
    });
    expect(new URL(url).searchParams.get("startAt")).toBe("42");
  });
});
