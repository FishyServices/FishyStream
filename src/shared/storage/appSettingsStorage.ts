import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type BookmarkSort,
  type BookmarkView,
  type ThemePreference,
  type AnimeLanguagePreference
} from "@/shared/config/appSettings";
import type { ContentSort } from "@/features/catalog/queries/useContent";
import { STREAM_PROVIDERS, type ProviderKey } from "@fishy/providers/streaming";
import type { FishyThemeAccent, FishyThemeRadius } from "@fishy/ui";
import { getLocalStorageItem, setLocalStorageItem } from "./browserStorage";

const APP_SETTINGS_KEY = "fishystream:preferences:app";
const THEMES = ["dark", "light"] satisfies readonly ThemePreference[];
const RADII = ["sharp", "rounded", "playful"] satisfies readonly FishyThemeRadius[];
const ACCENTS = ["cyan", "indigo", "rose", "emerald"] satisfies readonly FishyThemeAccent[];
const SORTS = ["trending", "popular", "new", "rating", "year"] satisfies readonly ContentSort[];
const BOOKMARK_SORTS = [
  "recently",
  "oldest",
  "title-az",
  "title-za"
] satisfies readonly BookmarkSort[];
const BOOKMARK_VIEWS = ["grid", "list"] satisfies readonly BookmarkView[];
const ANIME_LANGUAGES = ["sub", "dub"] satisfies readonly AnimeLanguagePreference[];
const PROVIDERS = ["auto", ...STREAM_PROVIDERS.map(({ key }) => key)] satisfies readonly (
  ProviderKey | "auto"
)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function choose<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.find((candidate) => candidate === value) ?? fallback;
}

function chooseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return DEFAULT_APP_SETTINGS;

  return {
    theme: choose(value.theme, THEMES, DEFAULT_APP_SETTINGS.theme),
    radius: choose(value.radius, RADII, DEFAULT_APP_SETTINGS.radius),
    accent: choose(value.accent, ACCENTS, DEFAULT_APP_SETTINGS.accent),
    defaultMovieSort: choose(value.defaultMovieSort, SORTS, DEFAULT_APP_SETTINGS.defaultMovieSort),
    defaultTVSort: choose(value.defaultTVSort, SORTS, DEFAULT_APP_SETTINGS.defaultTVSort),
    bookmarkSort: choose(value.bookmarkSort, BOOKMARK_SORTS, DEFAULT_APP_SETTINGS.bookmarkSort),
    bookmarkView: choose(value.bookmarkView, BOOKMARK_VIEWS, DEFAULT_APP_SETTINGS.bookmarkView),
    defaultProvider: choose(value.defaultProvider, PROVIDERS, DEFAULT_APP_SETTINGS.defaultProvider),
    autoPlayHeroTrailer: chooseBoolean(
      value.autoPlayHeroTrailer,
      DEFAULT_APP_SETTINGS.autoPlayHeroTrailer
    ),
    heroTrailerMuted: chooseBoolean(value.heroTrailerMuted, DEFAULT_APP_SETTINGS.heroTrailerMuted),
    showContinueWatchingRow: chooseBoolean(
      value.showContinueWatchingRow,
      DEFAULT_APP_SETTINGS.showContinueWatchingRow
    ),
    defaultAnimeLanguage: choose(
      value.defaultAnimeLanguage,
      ANIME_LANGUAGES,
      DEFAULT_APP_SETTINGS.defaultAnimeLanguage
    ),
    autoAdvanceEpisodes: chooseBoolean(
      value.autoAdvanceEpisodes,
      DEFAULT_APP_SETTINGS.autoAdvanceEpisodes
    ),
    showEpisodeRatings: chooseBoolean(
      value.showEpisodeRatings,
      DEFAULT_APP_SETTINGS.showEpisodeRatings
    ),
    showFillerEpisodes: chooseBoolean(
      value.showFillerEpisodes,
      DEFAULT_APP_SETTINGS.showFillerEpisodes
    )
  };
}

export function readAppSettings(): AppSettings {
  const stored = getLocalStorageItem(APP_SETTINGS_KEY);
  if (stored === null) return DEFAULT_APP_SETTINGS;

  try {
    return parseSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  setLocalStorageItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}
