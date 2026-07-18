import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { ClerkProvider, useAuth, useUser } from "@clerk/react";
import { dark } from "@clerk/themes";
import { applyFishyTheme } from "@fishy/ui";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { PostHogProvider, usePostHog } from "@posthog/react";
import { App } from "./App";
import { SignInPage } from "../pages/SignInPage";
import { SignUpPage } from "../pages/SignUpPage";
import { WatchPage } from "../pages/WatchPage";
import { MoviesPage } from "../pages/MoviesPage";
import { TVShowsPage } from "../pages/TVShowsPage";
import { OwnersPicksPage } from "../pages/OwnersPicksPage";
import { MyListPage } from "../pages/MyListPage";
import { WatchHistoryPage } from "../pages/WatchHistoryPage";
import { SearchPage } from "../pages/SearchPage";
import { SettingsPage } from "../pages/SettingsPage";
import { RecommendationsPage } from "../pages/RecommendationsPage";
import { GlobalWatchlistProvider } from "../features/library/useWatchlist";
import { WatchProgressProvider } from "../features/library/useWatchProgress";
import { AppSettingsProvider } from "../features/settings/useAppSettings";
import { isPostHogEnabled, posthog } from "../shared/config/posthog";
import "../index.css";

const isNativeShell = Capacitor.isNativePlatform();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in environment");
}

const convex = new ConvexReactClient(convexUrl);

applyFishyTheme({
  mode: "dark",
  density:
    isNativeShell || window.matchMedia("(max-width: 768px)").matches ? "touch" : "comfortable"
});

function useStableConvexClerkAuth() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return await getTokenRef.current({
          template: "convex",
          skipCache: forceRefreshToken
        });
      } catch {
        return null;
      }
    },
    []
  );

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken
    }),
    [fetchAccessToken, isLoaded, isSignedIn]
  );
}

function AppShell() {
  const auth = useAuth();

  if (!auth.isLoaded) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-primary/20 animate-pulse" />
            <div className="absolute inset-0 rounded-xl border-2 border-primary/40 animate-pulse" />
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin relative z-10" />
          </div>
          <span className="text-xs text-white/54 font-medium tracking-wide">
            Loading FishyStream…
          </span>
        </div>
      </div>
    );
  }

  return (
    <ConvexProviderWithAuth client={convex} useAuth={useStableConvexClerkAuth}>
      <AppSettingsProvider>
        <BrowserRouter>
          <GlobalWatchlistProvider>
            <WatchProgressProvider>
              <PostHogRouteTracker />
              <PostHogUserIdentifier />
              <Routes>
                <Route path="/sign-in/*" element={<SignInPage />} />
                <Route path="/sign-up/*" element={<SignUpPage />} />
                <Route path="/watch/:id" element={<WatchPage />} />
                <Route path="/movies" element={<MoviesPage />} />
                <Route path="/tv-shows" element={<TVShowsPage />} />
                <Route path="/best" element={<OwnersPicksPage />} />
                <Route path="/my-list" element={<MyListPage />} />
                <Route path="/history" element={<WatchHistoryPage />} />
                <Route path="/recommendations" element={<RecommendationsPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/discover" element={<App />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/" element={<App />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </WatchProgressProvider>
          </GlobalWatchlistProvider>
        </BrowserRouter>
      </AppSettingsProvider>
    </ConvexProviderWithAuth>
  );
}

function PostHogRouteTracker() {
  const location = useLocation();
  const posthogClient = usePostHog();

  useEffect(() => {
    if (!isPostHogEnabled) return;

    posthogClient.capture("$pageview", {
      $current_url: window.location.href
    });
  }, [location.pathname, location.search, location.hash, posthogClient]);

  return null;
}

function PostHogUserIdentifier() {
  const { isLoaded, isSignedIn, user } = useUser();
  const posthogClient = usePostHog();

  useEffect(() => {
    if (!isPostHogEnabled || !isLoaded) return;

    if (!isSignedIn || !user) {
      posthogClient.reset();
      return;
    }

    posthogClient.identify(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
      username: user.username,
      name: user.fullName
    });
  }, [isLoaded, isSignedIn, posthogClient, user]);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={publishableKey}
    signInUrl="/sign-in"
    signUpUrl="/sign-up"
    afterSignOutUrl="/"
    appearance={{
      variables: {
        colorPrimary: "oklch(0.62 0.1 182)",
        borderRadius: "0.75rem",
        fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
      }
    }}
  >
    <PostHogProvider client={posthog}>
      <AppShell />
    </PostHogProvider>
  </ClerkProvider>
);
