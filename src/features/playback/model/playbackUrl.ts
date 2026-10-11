export type PlaybackPlayer = "custom" | "embedded";
export type PlaybackContentType = "movie" | "tv";

export interface PlaybackRouteParams {
  type?: PlaybackContentType;
  season?: number;
  episode?: number;
  provider?: string;
  server?: string;
  player: PlaybackPlayer;
  dub?: boolean;
}

export interface PlaybackProviderParams {
  provider: string;
  server?: string;
  player: PlaybackPlayer;
}

export function getPlaybackPlayer(params: URLSearchParams): PlaybackPlayer {
  return params.get("player") === "custom" ? "custom" : "embedded";
}

export function getPlaybackProvider(params: URLSearchParams): string | undefined {
  return params.get("provider") ?? undefined;
}

export function getPlaybackServer(params: URLSearchParams): string | undefined {
  return params.get("server") ?? undefined;
}

export function isPlaybackAuto(params: URLSearchParams, defaultProvider?: string): boolean {
  return (
    getPlaybackProvider(params) === "auto" ||
    (!params.has("provider") && defaultProvider === "auto")
  );
}

export function readPlaybackRouteParams(params: URLSearchParams) {
  const type = params.get("type");
  const season = Number(params.get("season"));
  const episode = Number(params.get("episode"));
  const dub = params.get("dub");
  return {
    type: type === "movie" || type === "tv" ? type : undefined,
    season: Number.isFinite(season) && season > 0 ? season : undefined,
    episode: Number.isFinite(episode) && episode > 0 ? episode : undefined,
    provider: getPlaybackProvider(params),
    server: params.get("server") ?? undefined,
    player: getPlaybackPlayer(params),
    dub: dub === "true" ? true : dub === "false" ? false : undefined
  } satisfies PlaybackRouteParams;
}

export function setPlaybackContentParams(
  params: URLSearchParams,
  { type, season, episode, dub }: Pick<PlaybackRouteParams, "type" | "season" | "episode" | "dub">
) {
  if (type) params.set("type", type);
  if (season !== undefined) params.set("season", String(season));
  if (episode !== undefined) params.set("episode", String(episode));
  if (dub !== undefined) params.set("dub", String(dub));
}

export function getEffectiveAnimeDub(params: URLSearchParams, prefersDub: boolean): boolean {
  return readPlaybackRouteParams(params).dub ?? prefersDub;
}

export function setAnimeDubSearchParam(
  params: URLSearchParams,
  enabled: boolean,
  prefersDub: boolean
) {
  if (enabled || prefersDub) params.set("dub", String(enabled));
  else params.delete("dub");
}

export function buildPlaybackSearchParams({
  type,
  season,
  episode,
  provider,
  dub,
  player = "embedded"
}: Omit<PlaybackRouteParams, "server" | "player"> & { player?: PlaybackPlayer } = {}) {
  const params = new URLSearchParams();
  setPlaybackContentParams(params, { type, season, episode, dub: dub ? true : undefined });
  if (provider) setPlaybackProviderParams(params, { provider, player });
  return params;
}

export function setPlaybackProviderParams(
  params: URLSearchParams,
  { provider, server, player }: PlaybackProviderParams
) {
  params.delete("source");
  params.delete("ui");
  params.set("provider", provider);
  if (server && server !== "default") params.set("server", server);
  else params.delete("server");
  if (player === "custom") params.set("player", "custom");
  else params.delete("player");
}

export function normalizePlaybackUrlParams(
  params: URLSearchParams,
  defaultProvider?: string,
  server?: string
) {
  params.delete("source");
  params.delete("ui");
  if (params.get("player") !== "custom") params.delete("player");
  if (!getPlaybackProvider(params) && defaultProvider === "auto") {
    setPlaybackProviderParams(params, {
      provider: "auto",
      server,
      player: getPlaybackPlayer(params)
    });
  }
}
