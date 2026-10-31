import { getLocalStorageItem, setLocalStorageItem } from "./browserStorage";

const VOLUME_BOOST_KEY = "fishystream:player:volume-boost";
const MIN_VOLUME_BOOST = 1;
const MAX_VOLUME_BOOST = 3;
const SUBTITLE_PREFERENCES_KEY = "fishystream:player:subtitles";

export interface SubtitlePreferences {
  fontSize: number;
  bottom: number;
  backgroundStyle: "none" | "shadow" | "box";
  backgroundColor: "black" | "gray" | "cyan" | "white";
  backgroundOpacity: number;
}

const DEFAULT_SUBTITLE_PREFERENCES: SubtitlePreferences = {
  fontSize: 100,
  bottom: 8,
  backgroundStyle: "shadow",
  backgroundColor: "black",
  backgroundOpacity: 72
};

export function readSubtitlePreferences(): SubtitlePreferences {
  const stored = getLocalStorageItem(SUBTITLE_PREFERENCES_KEY);
  if (!stored) return DEFAULT_SUBTITLE_PREFERENCES;
  try {
    const value: unknown = JSON.parse(stored);
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
  } catch {
    return DEFAULT_SUBTITLE_PREFERENCES;
  }
}

export function saveSubtitlePreferences(preferences: SubtitlePreferences): void {
  setLocalStorageItem(SUBTITLE_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function readPlayerVolumeBoost(): number {
  const stored = getLocalStorageItem(VOLUME_BOOST_KEY);
  if (stored === null) return MIN_VOLUME_BOOST;

  const value = Number(stored);
  return Number.isFinite(value) && value >= MIN_VOLUME_BOOST && value <= MAX_VOLUME_BOOST
    ? value
    : MIN_VOLUME_BOOST;
}

export function savePlayerVolumeBoost(boost: number): void {
  const value = Math.min(MAX_VOLUME_BOOST, Math.max(MIN_VOLUME_BOOST, boost));
  setLocalStorageItem(VOLUME_BOOST_KEY, String(value));
}
