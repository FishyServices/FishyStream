type UmamiEventProperties = Record<string, string | number | boolean>;

type Umami = {
  track: {
    (
      payload?:
        | { url: string; title: string; referrer?: string }
        | ((properties: { url: string; title: string; referrer?: string }) => object)
    ): void;
    (eventName: string, data?: UmamiEventProperties): void;
  };
};

declare global {
  interface Window {
    umami?: Umami;
  }
}

const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
const scriptUrl = import.meta.env.VITE_UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js";
const pendingEvents: Array<(tracker: Umami) => void> = [];

if (import.meta.env.PROD && websiteId) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = scriptUrl;
  script.dataset.websiteId = websiteId;
  script.dataset.autoTrack = "false";
  script.dataset.doNotTrack = "true";
  script.onload = () => {
    const tracker = window.umami;
    if (!tracker) return;

    for (const event of pendingEvents.splice(0)) event(tracker);
  };
  document.head.append(script);
}

function track(event: (tracker: Umami) => void) {
  if (!import.meta.env.PROD || !websiteId) return;

  if (window.umami) event(window.umami);
  else pendingEvents.push(event);
}

export function trackPageView(path: string) {
  const safePath = path.replace(/^\/watch\/[^/]+/, "/watch/:id");
  const url = `${window.location.origin}${safePath}`;
  const referrer = document.referrer ? new URL(document.referrer).origin : "";

  track((tracker) =>
    tracker.track((properties) => ({ ...properties, url, title: "FishyStream", referrer }))
  );
}

export function trackPlaybackRequested(mediaType?: string) {
  track((tracker) =>
    tracker.track("playback_requested", {
      media_type: mediaType ?? "unknown"
    })
  );
}
