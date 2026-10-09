import { getGroupedProviders, getProviderByKey } from "./registry.js";
import type { ProviderCatalogEntry, ProviderCategory, ProviderKey, StreamSource } from "./types.js";

export interface ProviderSourceSet {
  provider: ProviderCatalogEntry;
  sources: StreamSource[];
}

export interface ProviderGroupedSources {
  key: ProviderCategory;
  label: string;
  providers: ProviderSourceSet[];
}

export interface SourcePreference {
  initialSource?: string;
  defaultProvider?: string;
}

export function groupSourcesByProviderCategory(sources: StreamSource[]): ProviderGroupedSources[] {
  const byKey = new Map<ProviderKey, StreamSource[]>();
  for (const source of sources) {
    byKey.set(source.key, [...(byKey.get(source.key) ?? []), source]);
  }

  const providers = [...byKey.keys()].flatMap((key) => getProviderByKey(key) ?? []);
  return getGroupedProviders(providers).map((group) => ({
    key: group.key,
    label: group.label,
    providers: group.providers.map((provider) => ({
      provider,
      sources: byKey.get(provider.key) ?? []
    }))
  }));
}

export function pickPreferredSource(
  sources: StreamSource[],
  { initialSource, defaultProvider }: SourcePreference
): StreamSource | undefined {
  const wanted = initialSource?.toLowerCase();
  const byName = wanted
    ? sources.find((source) => source.name.toLowerCase() === wanted)
    : undefined;
  if (byName) return byName;

  if (defaultProvider && defaultProvider !== "auto") {
    const byProvider = sources.find((source) => source.key === defaultProvider);
    if (byProvider) return byProvider;
  }

  return sources.find((source) => source.key === "direct") ?? sources[0];
}
