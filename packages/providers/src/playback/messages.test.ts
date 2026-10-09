import { describe, expect, it } from "vitest";
import { isTrustedPlayerMessageOrigin, parsePlayerMessage } from "./messages.js";

describe("player messages", () => {
  it("parses trusted player event payloads", () => {
    const payload = parsePlayerMessage(
      {
        type: "PLAYER_EVENT",
        data: { event: "timeupdate", currentTime: 50, duration: 100, mediaType: "movie" }
      },
      "https://peachify.top"
    );
    expect(payload?.data.progress).toBeUndefined();
    expect(payload?.data.currentTime).toBe(50);
  });

  it("normalizes JSON and legacy media progress payloads", () => {
    const payload = parsePlayerMessage(
      JSON.stringify({
        type: "MEDIA_DATA",
        data: { item: { id: 42, type: "movie", progress: { watched: 25, duration: 100 } } }
      })
    );
    expect(payload?.data).toMatchObject({
      currentTime: 25,
      duration: 100,
      progress: 25,
      id: "42",
      mediaType: "movie"
    });
  });

  it("normalizes raw progress and MegaPlay completion messages", () => {
    const rawProgress = parsePlayerMessage({
      id: "movie-1",
      type: "tv",
      progress: 80,
      timestamp: 800,
      duration: 1000,
      season: "2",
      episode: "3"
    });
    const completed = parsePlayerMessage({
      event: "complete",
      time: "100",
      duration: "100",
      percent: "100"
    });
    expect(rawProgress?.data).toMatchObject({
      currentTime: 800,
      progress: 80,
      season: 2,
      episode: 3
    });
    expect(completed?.data.event).toBe("ended");
    expect(completed?.data.progress).toBe(100);
  });

  it("normalizes MegaPlay watching logs", () => {
    const payload = parsePlayerMessage({ type: "watching-log", currentTime: 30, duration: 120 });
    expect(payload?.data).toMatchObject({ event: "timeupdate", progress: 25 });
  });

  it("normalizes CineSrc events", () => {
    const payload = parsePlayerMessage(
      { type: "cinesrc:timeupdate", currentTime: 15, duration: 60 },
      "https://cinesrc.st"
    );
    expect(payload?.data).toMatchObject({
      event: "timeupdate",
      currentTime: 15,
      duration: 60,
      progress: 25
    });
  });

  it("does not turn CineSrc pause events without timing into zero progress", () => {
    const payload = parsePlayerMessage({ type: "cinesrc:pause" }, "https://cinesrc.st");
    expect(payload?.data.event).toBe("pause");
    expect(payload?.data.currentTime).toBeUndefined();
    expect(payload?.data.duration).toBeUndefined();
  });

  it("rejects malformed messages", () => {
    expect(parsePlayerMessage({ type: "PLAYER_EVENT", data: {} })).toBeNull();
    expect(parsePlayerMessage("not-json")).toBeNull();
    expect(parsePlayerMessage({ type: "cinesrc:unknown" })).toBeNull();
  });

  it("rejects untrusted origins unless they match the active iframe origin", () => {
    expect(isTrustedPlayerMessageOrigin("https://evil.example")).toBe(false);
    expect(isTrustedPlayerMessageOrigin("https://local.example", "https://local.example")).toBe(
      true
    );
    expect(parsePlayerMessage({ type: "cinesrc:play" }, "https://evil.example")).toBeNull();
  });
});
