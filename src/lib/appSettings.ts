import type { ContentSort } from "@/hooks/useContent";
import type { ProviderKey } from "../../shared/providerCatalog";

export type ThemePreference = "dark" | "light";

export interface SortOption {
  label: string;
  value: ContentSort;
}

export interface AppSettings {
  theme: ThemePreference;
  defaultMovieSort: ContentSort;
  defaultTVSort: ContentSort;
  defaultProvider: ProviderKey | "auto";
  autoPlayHeroTrailer: boolean;
  showContinueWatchingRow: boolean;
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
  defaultMovieSort: "popular",
  defaultTVSort: "popular",
  defaultProvider: "auto",
  autoPlayHeroTrailer: false,
  showContinueWatchingRow: true
};

export const APP_SETTINGS_STORAGE_KEY = "fishystream:settings";
