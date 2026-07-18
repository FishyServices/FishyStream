import type { ContentSort } from "@/features/catalog/queries/useContent";
import type { ProviderKey } from "@fishy/providers/catalog";
import type { FishyThemeRadius, FishyThemeAccent } from "@fishy/ui";

export type ThemePreference = "dark" | "light";
export type AnimeLanguagePreference = "sub" | "dub";

export interface SortOption {
  label: string;
  value: ContentSort;
}

export interface AppSettings {
  theme: ThemePreference;
  radius: FishyThemeRadius;
  accent: FishyThemeAccent;
  defaultMovieSort: ContentSort;
  defaultTVSort: ContentSort;
  defaultProvider: ProviderKey | "auto";
  autoPlayHeroTrailer: boolean;
  heroTrailerMuted: boolean;
  showContinueWatchingRow: boolean;
  defaultAnimeLanguage: AnimeLanguagePreference;
  autoAdvanceEpisodes: boolean;
}

export const MOVIE_SORT_OPTIONS: SortOption[] = [
  { label: "Trending", value: "trending" },
  { label: "Popular", value: "popular" },
  { label: "New Releases", value: "new" },
  { label: "Top Rated", value: "rating" },
  { label: "Year", value: "year" }
];

export const TV_SORT_OPTIONS: SortOption[] = [
  { label: "Trending", value: "trending" },
  { label: "Popular", value: "popular" },
  { label: "Now Airing", value: "new" },
  { label: "Top Rated", value: "rating" },
  { label: "Year", value: "year" }
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "dark",
  radius: "rounded",
  accent: "indigo",
  defaultMovieSort: "popular",
  defaultTVSort: "popular",
  defaultProvider: "auto",
  autoPlayHeroTrailer: false,
  heroTrailerMuted: true,
  showContinueWatchingRow: true,
  defaultAnimeLanguage: "dub",
  autoAdvanceEpisodes: false
};

export const APP_SETTINGS_STORAGE_KEY = "fishystream:settings";
