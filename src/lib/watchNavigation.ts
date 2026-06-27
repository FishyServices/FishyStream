import type { NavigateFunction } from "react-router-dom";
import type { ContentType } from "../../shared/contentMetadata";

export type PlayHandler = (
  tmdbId: string,
  season?: number,
  episode?: number,
  source?: string,
  dub?: boolean,
  type?: ContentType
) => void;

export interface WatchPathOptions {
  tmdbId: string;
  type?: ContentType;
  season?: number;
  episode?: number;
  source?: string;
  dub?: boolean;
}

export function buildWatchPath({ tmdbId, type, season, episode, source, dub }: WatchPathOptions) {
  const params = new URLSearchParams();

  if (type) params.set("type", type);
  if (season !== undefined) params.set("season", String(season));
  if (episode !== undefined) params.set("episode", String(episode));
  if (source) params.set("source", source);
  if (dub) params.set("dub", "true");

  const query = params.toString();
  return `/watch/${tmdbId}${query ? `?${query}` : ""}`;
}

export function createPlayHandler(
  navigate: NavigateFunction,
  defaultType?: ContentType
): PlayHandler {
  return (tmdbId, season, episode, source, dub, type) => {
    navigate(
      buildWatchPath({
        tmdbId,
        type: type ?? defaultType,
        season,
        episode,
        source,
        dub
      })
    );
  };
}
