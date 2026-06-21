import type { ContentType } from "../../shared/contentMetadata";
import type { StreamSource } from "@fishy/providers/providerCatalog";

export interface ProviderDiagnosticEvent {
  providerKey?: string;
  contentType: ContentType;
  source?: Pick<StreamSource, "key" | "name" | "url">;
  fallbackAttempt?: number;
  message?: string;
  startedAt?: number;
  endedAt?: number;
}

function isDev() {
  return import.meta.env.DEV;
}

export function safeSourceUrl(
  rawUrl: string | undefined,
  baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.origin
) {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl, baseUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return rawUrl.split("?")[0];
  }
}

function serializeEvent(event: ProviderDiagnosticEvent) {
  return {
    providerKey: event.providerKey ?? event.source?.key,
    contentType: event.contentType,
    sourceName: event.source?.name,
    sourceUrl: safeSourceUrl(event.source?.url),
    fallbackAttempt: event.fallbackAttempt,
    message: event.message,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    elapsedMs:
      event.startedAt && event.endedAt ? Math.max(0, event.endedAt - event.startedAt) : undefined
  };
}

export function logProviderInfo(event: ProviderDiagnosticEvent) {
  if (!isDev()) return;
  console.info("[FishyStream:provider]", serializeEvent(event));
}

export function logProviderWarning(event: ProviderDiagnosticEvent) {
  if (!isDev()) return;
  console.warn("[FishyStream:provider]", serializeEvent(event));
}
