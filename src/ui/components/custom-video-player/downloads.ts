import { useEffect, useRef, useState } from "react";
import {
  getStoredDownload,
  removeStoredDownload,
  setStoredDownload
} from "@/shared/storage/downloadStore";

export type DownloadState =
  | { status: "idle" }
  | { status: "downloading"; received: number; total: number }
  | { status: "paused"; received: number; total: number }
  | { status: "completed" }
  | { status: "error"; message: string };

export type BatchDownloadState =
  | { status: "idle" }
  | { status: "downloading"; completed: number; total: number; progress: number }
  | { status: "completed"; completed: number; total: number }
  | { status: "error"; message: string };

type DownloadMode = "file" | "hls";
type EpisodeTarget = { season: number; episode: number };
type HlsPlaylist =
  | { kind: "master"; variants: Array<{ url: string; bandwidth: number }> }
  | { kind: "media"; parts: string[]; encrypted: boolean };

interface VideoDownloadOptions {
  contentId: string;
  contentTitle: string;
  contentType: "movie" | "tv";
  tvTarget: EpisodeTarget;
  selectedSource: string;
  localFile?: File;
  downloadReady: boolean;
  getEpisodeEmbedUrl?: (target: EpisodeTarget) => Promise<string | null>;
  downloadRequest?: { season: number; episodes: number[] } | null;
  onDownloadRequestConsumed?: () => void;
}

interface DownloadSource {
  url: string;
  mode: DownloadMode;
  persist: boolean;
}

interface VideoDownloads {
  downloadUrl: string | null;
  downloadState: DownloadState;
  batchDownloadState: BatchDownloadState;
  downloadProgress: number | null;
  batchDownloadProgress: number | null;
  downloadActionLabel: string;
  hasDownloadControl: boolean;
  selectedBatchEpisodes: number[];
  setSelectedBatchEpisodes: (episodes: number[]) => void;
  prepareDownload: (source: DownloadSource) => void;
  resetDownload: () => void;
  handleDownload: (downloadParts?: boolean) => void;
  handleBatchDownload: (episodes?: number[]) => void;
}

const STORED_DOWNLOAD_TTL_MS = 30_000;
const DOWNLOAD_PERSIST_INTERVAL = 1024 * 1024;

function saveDownloadPart(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function parseHlsPlaylist(text: string, baseUrl: string): HlsPlaylist {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const variants: Array<{ url: string; bandwidth: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line?.startsWith("#EXT-X-STREAM-INF:")) continue;
    const bandwidth = Number(line.match(/BANDWIDTH=(\d+)/)?.[1] ?? 0);
    const variantUrl = lines
      .slice(index + 1)
      .find((candidate) => candidate && !candidate.startsWith("#"));
    if (variantUrl) variants.push({ url: new URL(variantUrl, baseUrl).href, bandwidth });
  }

  if (variants.length > 0) return { kind: "master", variants };

  const encrypted = lines.some(
    (line) => line.startsWith("#EXT-X-KEY:") && !/METHOD=NONE/i.test(line)
  );
  const parts: string[] = [];
  const mapLine = lines.find((line) => line.startsWith("#EXT-X-MAP:"));
  const mapUrl = mapLine?.match(/URI="([^"]+)"/)?.[1];
  if (mapUrl) parts.push(new URL(mapUrl, baseUrl).href);

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    parts.push(new URL(line, baseUrl).href);
  }

  return { kind: "media", parts, encrypted };
}

function scraperUrl(embedUrl: string) {
  const endpoint = import.meta.env.DEV ? "http://localhost:4000/api/scrape" : "/api/scrape";
  return `${endpoint}?url=${encodeURIComponent(embedUrl)}`;
}

export function useVideoDownloads(options: VideoDownloadOptions): VideoDownloads {
  const {
    contentId,
    contentTitle,
    contentType,
    tvTarget,
    selectedSource,
    localFile,
    downloadReady,
    getEpisodeEmbedUrl,
    downloadRequest,
    onDownloadRequestConsumed
  } = options;
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({ status: "idle" });
  const [selectedBatchEpisodes, setSelectedBatchEpisodes] = useState<number[]>([]);
  const [batchDownloadState, setBatchDownloadState] = useState<BatchDownloadState>({
    status: "idle"
  });
  const downloadAbortRef = useRef<AbortController | null>(null);
  const batchDownloadAbortRef = useRef<AbortController | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const receivedRef = useRef(0);
  const totalRef = useRef(0);
  const contentTypeRef = useRef("video/mp4");
  const lastPersistedRef = useRef(0);
  const modeRef = useRef<DownloadMode>("file");
  const persistRef = useRef(!localFile);
  const storageKey = `${contentId}:${tvTarget.season}:${tvTarget.episode}:${selectedSource}`;

  const filenameFor = (target = tvTarget) =>
    `${contentTitle}${contentType === "tv" ? ` - S${target.season}E${target.episode}` : ""}.mp4`;

  const persistDownload = async (url: string, filename: string) => {
    if (!persistRef.current || receivedRef.current <= 0) return;
    await setStoredDownload({
      key: storageKey,
      kind: modeRef.current,
      url,
      filename,
      chunks: chunksRef.current,
      received: receivedRef.current,
      total: totalRef.current,
      contentType: contentTypeRef.current,
      updatedAt: Date.now()
    });
  };

  const prepareDownload = (source: DownloadSource) => {
    setDownloadUrl(source.url);
    modeRef.current = source.mode;
    persistRef.current = source.persist;
    if (!source.persist || contentType !== "movie") return;

    void getStoredDownload(storageKey)
      .then((stored) => {
        if (stored && Date.now() - stored.updatedAt > STORED_DOWNLOAD_TTL_MS) {
          void removeStoredDownload(storageKey);
          return;
        }
        if (
          !stored ||
          stored.kind !== source.mode ||
          stored.url !== source.url ||
          stored.received <= 0
        ) {
          return;
        }
        chunksRef.current = stored.chunks;
        receivedRef.current = stored.received;
        totalRef.current = stored.total;
        contentTypeRef.current = stored.contentType;
        lastPersistedRef.current = stored.received;
        setDownloadState({ status: "paused", received: stored.received, total: stored.total });
      })
      .catch(() => {});
  };

  const resetDownload = () => {
    downloadAbortRef.current?.abort();
    chunksRef.current = [];
    receivedRef.current = 0;
    totalRef.current = 0;
    lastPersistedRef.current = 0;
    setDownloadUrl(null);
    setDownloadState({ status: "idle" });
  };

  const downloadHls = async (
    controller: AbortController,
    filename: string,
    downloadParts: boolean
  ) => {
    if (!downloadUrl) return;
    const masterResponse = await fetch(downloadUrl, { signal: controller.signal });
    if (!masterResponse.ok) throw new Error(`Download failed (${masterResponse.status}).`);
    const masterPlaylist = parseHlsPlaylist(await masterResponse.text(), downloadUrl);
    const mediaUrl =
      masterPlaylist.kind === "master"
        ? [...masterPlaylist.variants].sort((a, b) => b.bandwidth - a.bandwidth)[0]?.url
        : downloadUrl;
    if (!mediaUrl) throw new Error("The HLS stream has no playable variant.");
    const mediaResponse = await fetch(mediaUrl, { signal: controller.signal });
    if (!mediaResponse.ok) throw new Error(`Download failed (${mediaResponse.status}).`);
    const mediaPlaylist = parseHlsPlaylist(await mediaResponse.text(), mediaUrl);
    if (mediaPlaylist.kind !== "media" || mediaPlaylist.parts.length === 0) {
      throw new Error("The HLS stream has no media segments.");
    }
    if (mediaPlaylist.encrypted)
      throw new Error("This HLS stream is encrypted and cannot be downloaded here.");
    if (receivedRef.current > mediaPlaylist.parts.length)
      throw new Error("The saved download no longer matches this stream.");

    totalRef.current = mediaPlaylist.parts.length;
    setDownloadState({
      status: "downloading",
      received: receivedRef.current,
      total: totalRef.current
    });
    for (let index = receivedRef.current; index < mediaPlaylist.parts.length; index += 1) {
      const segmentUrl = mediaPlaylist.parts[index];
      if (!segmentUrl) throw new Error("The HLS segment list changed.");
      const response = await fetch(segmentUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`Segment download failed (${response.status}).`);
      const segmentBlob = await response.blob();
      chunksRef.current.push(segmentBlob);
      if (downloadParts) {
        saveDownloadPart(
          segmentBlob,
          `${filename.replace(/\.mp4$/i, "")}.part-${String(index + 1).padStart(3, "0")}.ts`
        );
      }
      receivedRef.current = index + 1;
      setDownloadState({
        status: "downloading",
        received: receivedRef.current,
        total: totalRef.current
      });
      await persistDownload(downloadUrl, filename);
    }
    if (!downloadParts)
      saveDownloadPart(new Blob(chunksRef.current, { type: "video/mp4" }), filename);
  };

  const handleDownload = (downloadParts = false) => {
    if (!downloadUrl) return;
    if (downloadState.status === "downloading") {
      downloadAbortRef.current?.abort();
      return;
    }
    if (downloadState.status === "completed" || downloadState.status === "error") {
      chunksRef.current = [];
      receivedRef.current = 0;
      totalRef.current = 0;
      lastPersistedRef.current = 0;
    }
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    const startAt = receivedRef.current;
    const filename = filenameFor();
    setDownloadState({ status: "downloading", received: startAt, total: totalRef.current });

    void (async () => {
      try {
        if (modeRef.current === "hls") {
          await downloadHls(controller, filename, downloadParts);
        } else {
          const response = await fetch(downloadUrl, {
            headers: startAt > 0 ? { Range: `bytes=${startAt}-` } : undefined,
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`Download failed (${response.status}).`);
          if (startAt > 0 && response.status !== 206)
            throw new Error("This stream does not support resuming downloads.");
          const contentRange = response.headers.get("content-range");
          const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
          const contentLength = Number(response.headers.get("content-length"));
          const total = rangeTotal
            ? Number(rangeTotal)
            : Number.isFinite(contentLength)
              ? contentLength + startAt
              : startAt;
          const reader = response.body?.getReader();
          if (!reader) throw new Error("The download did not return a readable file.");
          contentTypeRef.current = response.headers.get("content-type") ?? "video/mp4";
          totalRef.current = total;
          setDownloadState({ status: "downloading", received: startAt, total });
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (!chunk.value) continue;
            chunksRef.current.push(new Blob([chunk.value]));
            receivedRef.current += chunk.value.byteLength;
            setDownloadState({
              status: "downloading",
              received: receivedRef.current,
              total: totalRef.current
            });
            if (receivedRef.current - lastPersistedRef.current >= DOWNLOAD_PERSIST_INTERVAL) {
              await persistDownload(downloadUrl, filename);
              lastPersistedRef.current = receivedRef.current;
            }
          }
          saveDownloadPart(new Blob(chunksRef.current, { type: contentTypeRef.current }), filename);
        }
        await removeStoredDownload(storageKey);
        setDownloadState({ status: "completed" });
      } catch (error: unknown) {
        await persistDownload(downloadUrl, filename).catch(() => {});
        if (controller.signal.aborted) {
          setDownloadState({
            status: "paused",
            received: receivedRef.current,
            total: totalRef.current
          });
        } else {
          setDownloadState({
            status: "error",
            message: error instanceof Error ? error.message : "Download failed."
          });
        }
      } finally {
        if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
      }
    })();
  };

  const downloadBatchEpisode = async (
    target: EpisodeTarget,
    signal: AbortSignal,
    onProgress: (progress: number) => void
  ) => {
    if (!getEpisodeEmbedUrl) throw new Error("Episode downloads are unavailable.");
    const embedUrl = await getEpisodeEmbedUrl(target);
    if (!embedUrl) throw new Error(`No stream found for episode ${target.episode}.`);
    const scrapeResponse = await fetch(scraperUrl(embedUrl), { signal });
    if (!scrapeResponse.ok) throw new Error(`Could not load episode ${target.episode}.`);
    const data: unknown = await scrapeResponse.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("streamUrl" in data) ||
      typeof data.streamUrl !== "string" ||
      !data.streamUrl
    ) {
      throw new Error(`No downloadable stream found for episode ${target.episode}.`);
    }
    const filename = filenameFor(target);
    if (!("mediaType" in data && data.mediaType === "hls") && !data.streamUrl.includes(".m3u8")) {
      const response = await fetch(data.streamUrl, { signal });
      if (!response.ok) throw new Error(`Episode ${target.episode} download failed.`);
      saveDownloadPart(await response.blob(), filename);
      onProgress(1);
      return;
    }
    const response = await fetch(data.streamUrl, { signal });
    if (!response.ok) throw new Error(`Episode ${target.episode} playlist failed.`);
    const playlist = parseHlsPlaylist(await response.text(), data.streamUrl);
    const mediaUrl =
      playlist.kind === "master"
        ? [...playlist.variants].sort((a, b) => b.bandwidth - a.bandwidth)[0]?.url
        : data.streamUrl;
    if (!mediaUrl) throw new Error(`Episode ${target.episode} has no video variant.`);
    const mediaResponse = playlist.kind === "master" ? await fetch(mediaUrl, { signal }) : response;
    if (!mediaResponse.ok) throw new Error(`Episode ${target.episode} media playlist failed.`);
    const mediaPlaylist =
      playlist.kind === "master"
        ? parseHlsPlaylist(await mediaResponse.text(), mediaUrl)
        : playlist;
    if (mediaPlaylist.kind !== "media" || mediaPlaylist.encrypted)
      throw new Error(`Episode ${target.episode} uses an unsupported encrypted stream.`);
    const parts: Blob[] = [];
    for (const [index, partUrl] of mediaPlaylist.parts.entries()) {
      const partResponse = await fetch(partUrl, { signal });
      if (!partResponse.ok) throw new Error(`Episode ${target.episode} segment failed.`);
      parts.push(await partResponse.blob());
      onProgress((index + 1) / mediaPlaylist.parts.length);
    }
    saveDownloadPart(new Blob(parts, { type: "video/mp4" }), filename);
  };

  const handleBatchDownload = (requestedEpisodes = selectedBatchEpisodes) => {
    if (!getEpisodeEmbedUrl || contentType !== "tv" || batchDownloadState.status === "downloading")
      return;
    const currentDownloadActive = ["downloading", "paused", "completed"].includes(
      downloadState.status
    );
    const targets = [...new Set(requestedEpisodes)]
      .filter((episode) => !(episode === tvTarget.episode && currentDownloadActive))
      .sort((a, b) => a - b)
      .map((episode) => ({ season: tvTarget.season, episode }));
    if (targets.length === 0) return;
    const controller = new AbortController();
    batchDownloadAbortRef.current = controller;
    setBatchDownloadState({
      status: "downloading",
      completed: 0,
      total: targets.length,
      progress: 0
    });
    void (async () => {
      for (const [index, target] of targets.entries()) {
        await downloadBatchEpisode(target, controller.signal, (progress) => {
          setBatchDownloadState((current) =>
            current.status === "downloading"
              ? { ...current, progress: ((index + progress) / targets.length) * 100 }
              : current
          );
        });
        setBatchDownloadState((current) =>
          current.status === "downloading"
            ? { ...current, completed: index + 1, progress: ((index + 1) / targets.length) * 100 }
            : current
        );
      }
    })()
      .then(() =>
        setBatchDownloadState({
          status: "completed",
          completed: targets.length,
          total: targets.length
        })
      )
      .catch((error: unknown) =>
        setBatchDownloadState(
          controller.signal.aborted
            ? { status: "idle" }
            : {
                status: "error",
                message:
                  error instanceof Error ? error.message : "Some episodes could not be downloaded."
              }
        )
      )
      .finally(() => {
        if (batchDownloadAbortRef.current === controller) batchDownloadAbortRef.current = null;
      });
  };

  useEffect(() => {
    setSelectedBatchEpisodes([]);
  }, [tvTarget.season]);

  useEffect(() => {
    if (!downloadRequest || downloadRequest.season !== tvTarget.season) return;
    onDownloadRequestConsumed?.();
    setSelectedBatchEpisodes(downloadRequest.episodes);
    handleBatchDownload(downloadRequest.episodes);
  }, [downloadRequest, tvTarget.season]);

  useEffect(
    () => () => {
      downloadAbortRef.current?.abort();
      batchDownloadAbortRef.current?.abort();
    },
    []
  );

  const downloadProgress =
    downloadState.status === "downloading" || downloadState.status === "paused"
      ? downloadState.total > 0
        ? Math.round((downloadState.received / downloadState.total) * 100)
        : 0
      : null;
  const batchDownloadProgress =
    batchDownloadState.status === "downloading" && batchDownloadState.total > 0
      ? Math.round(batchDownloadState.progress)
      : null;
  const downloadActionLabel =
    downloadState.status === "downloading"
      ? "Pause download"
      : downloadState.status === "paused"
        ? "Resume download"
        : downloadState.status === "error"
          ? "Retry download"
          : "Download movie";

  return {
    downloadUrl,
    downloadState,
    batchDownloadState,
    downloadProgress,
    batchDownloadProgress,
    downloadActionLabel,
    hasDownloadControl: !!downloadUrl || (!localFile && downloadReady),
    selectedBatchEpisodes,
    setSelectedBatchEpisodes,
    prepareDownload,
    resetDownload,
    handleDownload,
    handleBatchDownload
  };
}
