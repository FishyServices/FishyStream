export interface PlayerControls {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (level: number) => void;
  mute: (muted: boolean) => void;
  getStatus: () => void;
}

export function postMessageToPlayer(
  iframe: HTMLIFrameElement | null,
  command: string,
  params?: Record<string, unknown>,
  serialize = false
): void {
  if (!iframe?.contentWindow) return;
  const message = { command, ...params };
  iframe.contentWindow.postMessage(serialize ? JSON.stringify(message) : message, "*");
}

export function createPlayerControls(iframeRef: {
  current: HTMLIFrameElement | null;
}): PlayerControls {
  return {
    play: () => postMessageToPlayer(iframeRef.current, "play"),
    pause: () => postMessageToPlayer(iframeRef.current, "pause"),
    seek: (time: number) => postMessageToPlayer(iframeRef.current, "seek", { time }),
    setVolume: (level: number) => postMessageToPlayer(iframeRef.current, "volume", { level }),
    mute: (muted: boolean) => postMessageToPlayer(iframeRef.current, "mute", { muted }),
    getStatus: () => postMessageToPlayer(iframeRef.current, "getStatus")
  };
}
