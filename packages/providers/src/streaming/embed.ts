import type { MediaType } from "../shared/media.js";
import type { ProviderCatalogEntry } from "./types.js";

export type ProviderEmbedUrlProvider = Pick<
  ProviderCatalogEntry,
  "key" | "origins" | "progress" | "params"
>;

export interface ProviderEmbedUrlOptions {
  sourceUrl: string;
  provider?: ProviderEmbedUrlProvider;
  providerParams?: Record<string, boolean | string | number>;
  contentType: MediaType;
  resumePositionSeconds?: number;
  watchCompleted?: boolean;
  baseUrl?: string;
}

const TV_PARAM_OVERRIDES: ReadonlyArray<readonly [string, string]> = [
  ["nextButton", "false"],
  ["nextbutton", "false"],
  ["nextEpisode", "false"],
  ["nextepisode", "hide"],
  ["autoNext", "false"],
  ["autonext", "false"],
  ["autoplayNextEpisode", "false"],
  ["prevepisode", "hide"],
  ["episodelist", "false"],
  ["episodeSelector", "false"],
  ["episodeselector", "false"],
  ["hideServerControls", "true"],
  ["hideServer", "true"]
];

export function supportsProviderResume(
  provider: ProviderEmbedUrlProvider | undefined,
  contentType: MediaType
): boolean {
  if (!provider) return false;
  const allowed = provider.progress?.resumeContentTypes;
  return !allowed || allowed.includes(contentType);
}

export function applyProviderEmbedParams(
  url: URL,
  provider: ProviderEmbedUrlProvider | undefined,
  contentType: MediaType,
  providerParams: Record<string, boolean | string | number> = {}
): void {
  const schema = provider?.params;
  if (!schema) return;
  for (const [key, value] of Object.entries(providerParams)) {
    if (key in schema) url.searchParams.set(key, String(value));
  }
  if (contentType === "tv") {
    for (const [key, value] of TV_PARAM_OVERRIDES) {
      if (key in schema) url.searchParams.set(key, value);
    }
  }
}

export function createProviderEmbedUrl({
  sourceUrl,
  provider,
  providerParams,
  contentType,
  resumePositionSeconds = 0,
  watchCompleted = false,
  baseUrl = "http://localhost"
}: ProviderEmbedUrlOptions): string {
  try {
    const url = new URL(sourceUrl, baseUrl);
    const shouldResume =
      resumePositionSeconds > 0 && !watchCompleted && supportsProviderResume(provider, contentType);
    const resumeParam = provider?.progress?.resumeParam;

    applyProviderEmbedParams(url, provider, contentType, providerParams);

    if (resumeParam && provider?.progress?.forceStartPosition) {
      url.searchParams.set(resumeParam, String(shouldResume ? resumePositionSeconds : 0));
    } else if (resumeParam && shouldResume) {
      url.searchParams.set(resumeParam, String(resumePositionSeconds));
    }

    return url.toString();
  } catch {
    return sourceUrl;
  }
}
