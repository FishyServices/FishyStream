import { STREAM_PROVIDERS } from "./providers.js";
import type { ProviderCatalogEntry, ProviderCategory, ProviderKey } from "./types.js";

export { STREAM_PROVIDERS };

export interface ProviderGroup {
  key: ProviderCategory;
  label: string;
  providers: ProviderCatalogEntry[];
}

export const DIRECT_PROVIDER: ProviderCatalogEntry = {
  key: "direct",
  name: "Direct",
  category: "other",
  idType: "tmdb",
  origins: [],
  getMovieUrl: () => "",
  getTVUrl: () => ""
};

const CATEGORY_LABELS: ReadonlyArray<readonly [ProviderCategory, string]> = [
  ["primary", "Primary"],
  ["primary_anime", "Primary Anime"],
  ["other", "Other Sources"]
];

function indexProviders(): {
  byKey: ReadonlyMap<ProviderKey, ProviderCatalogEntry>;
  byOrigin: ReadonlyMap<string, ProviderCatalogEntry>;
} {
  const byKey = new Map<ProviderKey, ProviderCatalogEntry>();
  const byOrigin = new Map<string, ProviderCatalogEntry>();
  for (const provider of [...STREAM_PROVIDERS, DIRECT_PROVIDER]) {
    if (byKey.has(provider.key)) throw new Error(`Duplicate provider key: ${provider.key}`);
    byKey.set(provider.key, provider);
    for (const origin of provider.origins) {
      if (!byOrigin.has(origin)) byOrigin.set(origin, provider);
    }
  }
  return { byKey, byOrigin };
}

const { byKey, byOrigin } = indexProviders();

export function getProviderByKey(key: string): ProviderCatalogEntry | undefined {
  return byKey.get(key as ProviderKey);
}

export function getProviderByOrigin(origin: string): ProviderCatalogEntry | undefined {
  return byOrigin.get(origin);
}

export function getProviderId(
  provider: ProviderCatalogEntry,
  imdbId?: string,
  tmdbId?: string
): string | null {
  switch (provider.idType) {
    case "tmdb":
      return tmdbId || null;
    case "imdb":
      return imdbId?.startsWith("tt") ? imdbId : null;
    case "both":
      return imdbId || tmdbId || null;
  }
}

export function getProviderCapabilities(provider: ProviderCatalogEntry): string[] {
  const capabilities = [provider.idType === "both" ? "TMDB/IMDb" : provider.idType.toUpperCase()];
  if (provider.getAnimeTVUrl) capabilities.push("Anime");
  if (provider.dubSupport) capabilities.push("Sub/Dub");
  if (provider.progress?.resumeParam) capabilities.push("Resume");
  return capabilities;
}

export function getGroupedProviders(
  providers: readonly ProviderCatalogEntry[] = STREAM_PROVIDERS
): ProviderGroup[] {
  return CATEGORY_LABELS.map(([key, label]) => ({
    key,
    label,
    providers: providers.filter((provider) => provider.category === key)
  })).filter((group) => group.providers.length > 0);
}
