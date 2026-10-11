import type { NavigateFunction } from "react-router-dom";
import type { ContentType } from "@content/contentMetadata";
import { buildPlaybackSearchParams } from "@/features/playback/model/playbackUrl";

export type PlayHandler = (
  tmdbId: string,
  season?: number,
  episode?: number,
  provider?: string,
  dub?: boolean,
  type?: ContentType
) => void;

export interface WatchPathOptions {
  tmdbId: string;
  type?: ContentType;
  season?: number;
  episode?: number;
  provider?: string;
  dub?: boolean;
}

export function buildWatchPath({ tmdbId, type, season, episode, provider, dub }: WatchPathOptions) {
  const params = buildPlaybackSearchParams({ type, season, episode, provider, dub });

  const query = params.toString();
  return `/watch/${tmdbId}${query ? `?${query}` : ""}`;
}

export function createPlayHandler(
  navigate: NavigateFunction,
  defaultType?: ContentType
): PlayHandler {
  return (tmdbId, season, episode, provider, dub, type) => {
    navigate(
      buildWatchPath({
        tmdbId,
        type: type ?? defaultType,
        season,
        episode,
        provider,
        dub
      })
    );
  };
}
