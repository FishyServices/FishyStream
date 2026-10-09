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
  options: { serialize?: boolean; targetOrigin?: string } = {}
): void {
  const { serialize = false, targetOrigin = "*" } = options;
  if (!iframe?.contentWindow) return;
  const message = { command, ...params };
  iframe.contentWindow.postMessage(serialize ? JSON.stringify(message) : message, targetOrigin);
}

export function createPlayerControls(
  iframeRef: { current: HTMLIFrameElement | null },
  targetOrigin = "*"
): PlayerControls {
  const send = (command: string, params?: Record<string, unknown>) =>
    postMessageToPlayer(iframeRef.current, command, params, { targetOrigin });
  return {
    play: () => send("play"),
    pause: () => send("pause"),
    seek: (time) => send("seek", { time }),
    setVolume: (level) => send("volume", { level }),
    mute: (muted) => send("mute", { muted }),
    getStatus: () => send("getStatus")
  };
}
