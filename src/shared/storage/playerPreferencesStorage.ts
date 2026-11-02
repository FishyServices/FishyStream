import { getLocalStorageItem, setLocalStorageItem } from "./browserStorage";

const PLAYER_PREFERENCES_KEY = "fishystream:player:preferences";
const MIN_VOLUME_BOOST = 0;
const MAX_VOLUME_BOOST = 3;

export interface SubtitlePreferences {
  fontSize: number;
  bottom: number;
  backgroundStyle: "none" | "shadow" | "box";
  backgroundColor: "black" | "gray" | "cyan" | "white";
  backgroundOpacity: number;
}

interface PlayerPreferences {
  volumeBoost: number;
  subtitle: SubtitlePreferences;
  subtitleTrack: string | null;
  subtitleOffset: number;
}

const DEFAULT_SUBTITLE_PREFERENCES: SubtitlePreferences = {
  fontSize: 100,
  bottom: 8,
  backgroundStyle: "shadow",
  backgroundColor: "black",
  backgroundOpacity: 72
};

const DEFAULT_PREFERENCES: PlayerPreferences = {
  volumeBoost: MIN_VOLUME_BOOST,
  subtitle: DEFAULT_SUBTITLE_PREFERENCES,
  subtitleTrack: null,
  subtitleOffset: 0
};

function readPreferences(): PlayerPreferences {
  const stored = getLocalStorageItem(PLAYER_PREFERENCES_KEY);
  if (!stored) return DEFAULT_PREFERENCES;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;
    const preferences = value as Partial<PlayerPreferences>;
    const subtitle = preferences.subtitle;
    return {
      volumeBoost:
        typeof preferences.volumeBoost === "number" &&
        preferences.volumeBoost >= MIN_VOLUME_BOOST &&
        preferences.volumeBoost <= MAX_VOLUME_BOOST
          ? preferences.volumeBoost
          : MIN_VOLUME_BOOST,
      subtitle: normalizeSubtitlePreferences(subtitle),
      subtitleTrack:
        typeof preferences.subtitleTrack === "string" ? preferences.subtitleTrack : null,
      subtitleOffset:
        typeof preferences.subtitleOffset === "number" &&
        Number.isFinite(preferences.subtitleOffset)
          ? Math.min(5, Math.max(-5, preferences.subtitleOffset))
          : 0
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function normalizeSubtitlePreferences(value: unknown): SubtitlePreferences {
  if (typeof value !== "object" || value === null) return DEFAULT_SUBTITLE_PREFERENCES;
  const preferences = value as Partial<SubtitlePreferences>;
  return {
    fontSize:
      typeof preferences.fontSize === "number"
        ? Math.min(300, Math.max(50, preferences.fontSize))
        : 100,
    bottom:
      typeof preferences.bottom === "number" ? Math.min(20, Math.max(2, preferences.bottom)) : 8,
    backgroundStyle:
      preferences.backgroundStyle === "none" || preferences.backgroundStyle === "box"
        ? preferences.backgroundStyle
        : "shadow",
    backgroundColor:
      preferences.backgroundColor === "gray" ||
      preferences.backgroundColor === "cyan" ||
      preferences.backgroundColor === "white"
        ? preferences.backgroundColor
        : "black",
    backgroundOpacity:
      typeof preferences.backgroundOpacity === "number"
        ? Math.min(100, Math.max(0, preferences.backgroundOpacity))
        : 72
  };
}

function updatePreferences(update: Partial<PlayerPreferences>): void {
  setLocalStorageItem(PLAYER_PREFERENCES_KEY, JSON.stringify({ ...readPreferences(), ...update }));
}

export function readSubtitlePreferences(): SubtitlePreferences {
  return readPreferences().subtitle;
}

export function saveSubtitlePreferences(subtitle: SubtitlePreferences): void {
  updatePreferences({ subtitle });
}

export function readSubtitleTrack(): string | null {
  return readPreferences().subtitleTrack;
}

export function saveSubtitleTrack(subtitleTrack: string): void {
  updatePreferences({ subtitleTrack });
}

export function readSubtitleOffset(): number {
  return readPreferences().subtitleOffset;
}

export function saveSubtitleOffset(subtitleOffset: number): void {
  updatePreferences({ subtitleOffset: Math.min(5, Math.max(-5, subtitleOffset)) });
}

export function readPlayerVolumeBoost(): number {
  return readPreferences().volumeBoost;
}

export function savePlayerVolumeBoost(volumeBoost: number): void {
  updatePreferences({
    volumeBoost: Math.min(MAX_VOLUME_BOOST, Math.max(MIN_VOLUME_BOOST, volumeBoost))
  });
}
