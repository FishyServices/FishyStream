export type TsuzukiAirType = "raw" | "sub" | "dub";

export interface TsuzukiScheduleEpisode {
  mediaId: number;
  episode: number;
  airType: TsuzukiAirType;
  airingAt: number | null;
  airingAtIso: string | null;
  exact: boolean;
  estimated: boolean;
  platform: string | null;
  isBreak: boolean;
  title: string;
  coverImage: string | null;
}

export interface TsuzukiSchedule {
  ok: true;
  count: number;
  episodes: TsuzukiScheduleEpisode[];
  attribution: string;
}

export type TsuzukiPayload = Record<string, unknown>;
export type TsuzukiParams = Record<string, string | number | undefined>;
export type TsuzukiRequest = (
  path: string,
  params?: TsuzukiParams,
  signal?: AbortSignal
) => Promise<unknown>;
