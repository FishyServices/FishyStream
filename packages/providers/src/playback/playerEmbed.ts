import { type ProviderCatalogEntry, type ProviderKey } from "../catalog/providerCatalog.js";

export type ProviderContentType = "movie" | "tv";

export type ProviderEmbedUrlProvider = Pick<
  ProviderCatalogEntry,
  "key" | "origins" | "progress" | "params"
>;

export interface ProviderEmbedUrlOptions {
  sourceUrl: string;
  provider?: ProviderEmbedUrlProvider;
  contentType: ProviderContentType;
  resumePositionSeconds?: number;
  watchCompleted?: boolean;
  baseUrl?: string;
}

export function shouldApplyProviderResume(
  providerKey: ProviderKey | string | undefined,
  contentType: ProviderContentType
) {
  if (!providerKey) return false;
  if (providerKey === "vidking" && contentType === "tv") return false;
  if (providerKey === "vidnest" && contentType === "tv") return false;
  return true;
}

export function shouldForceProviderStartPosition(providerKey: ProviderKey | string | undefined) {
  return providerKey === "vidfast";
}

export function applyProviderEmbedParams(
  url: URL,
  provider: ProviderEmbedUrlProvider | undefined,
  contentType: ProviderContentType
) {
  if (contentType !== "tv" || !provider?.params) return;

  const paramsSchema = provider.params;

  const setIfSupported = (key: string, value: string) => {
    if (key in paramsSchema) {
      url.searchParams.set(key, value);
    }
  };

  setIfSupported("nextButton", "false");
  setIfSupported("nextbutton", "false");
  setIfSupported("nextEpisode", "false");
  setIfSupported("nextepisode", "hide");

  setIfSupported("autoNext", "false");
  setIfSupported("autonext", "false");
  setIfSupported("autoplayNextEpisode", "false");

  setIfSupported("prevepisode", "hide");

  setIfSupported("episodelist", "false");
  setIfSupported("episodeSelector", "false");
  setIfSupported("episodeselector", "false");

  setIfSupported("hideServerControls", "true");
  setIfSupported("hideServer", "true");
}

export function createProviderEmbedUrl({
  sourceUrl,
  provider,
  contentType,
  resumePositionSeconds = 0,
  watchCompleted = false,
  baseUrl = "http://localhost"
}: ProviderEmbedUrlOptions) {
  try {
    const url = new URL(sourceUrl, baseUrl);
    const providerKey = provider?.key;
    const shouldResume =
      resumePositionSeconds > 0 &&
      !watchCompleted &&
      shouldApplyProviderResume(providerKey, contentType);

    applyProviderEmbedParams(url, provider, contentType);

    if (provider?.progress?.resumeParam && shouldForceProviderStartPosition(providerKey)) {
      url.searchParams.set(
        provider.progress.resumeParam,
        String(shouldResume ? resumePositionSeconds : 0)
      );
    } else if (shouldResume && provider?.progress?.resumeParam) {
      url.searchParams.set(provider.progress.resumeParam, String(resumePositionSeconds));
    }

    return url.toString();
  } catch {
    return sourceUrl;
  }
}
