import posthog from "posthog-js";

const posthogToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

export const isPostHogEnabled = Boolean(posthogToken);

if (isPostHogEnabled) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-05-30",
    capture_pageview: false
  });
}

export { posthog };
