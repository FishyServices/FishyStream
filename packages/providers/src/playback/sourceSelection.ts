import {
  getGroupedProviders,
  getProviderByKey,
  type ProviderCatalogEntry,
  type StreamSource
} from "../catalog/providerCatalog.js";

export interface ProviderSourceSet {
  provider: ProviderCatalogEntry;
  sources: StreamSource[];
}

export interface ProviderGroupedSources {
  key: "primary" | "primary_anime" | "other";
  label: string;
  providers: ProviderSourceSet[];
}

export function groupSourcesByProviderCategory(sources: StreamSource[]): ProviderGroupedSources[] {
  return getGroupedProviders(
    [...new Set(sources.map((source) => source.key))]
      .map((key) => getProviderByKey(key))
      .filter(
        (provider): provider is NonNullable<ReturnType<typeof getProviderByKey>> => !!provider
      )
  )
    .map((group) => ({
      key: group.key,
      label: group.label,
      providers: group.providers.flatMap((provider) => {
        const providerSources = sources.filter((source) => source.key === provider.key);
        return providerSources.length ? [{ provider, sources: providerSources }] : [];
      })
    }))
    .filter((group) => group.providers.length > 0);
}

export function pickPreferredSource(
  sources: StreamSource[],
  options: { initialSource?: string; defaultProvider?: string }
): StreamSource | undefined {
  const { initialSource, defaultProvider } = options;

  if (initialSource) {
    const source = sources.find(
      (entry) => entry.name.toLowerCase() === initialSource.toLowerCase()
    );
    if (source) return source;
  }

  if (defaultProvider && defaultProvider !== "auto") {
    const source = sources.find((entry) => entry.key === defaultProvider);
    if (source) return source;
  }

  const directSource = sources.find((entry) => entry.key === "direct");
  if (directSource) return directSource;

  return sources[0];
}
