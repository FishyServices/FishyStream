import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@clerk/react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AppSettingsProvider } from "@/hooks/useAppSettings";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in environment");
}
const convex = new ConvexReactClient(convexUrl);

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

export const Route = createRootRoute({
  component: RootComponent
});

function RootComponent() {
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
        <Outlet />
      </AppSettingsProvider>
    </ConvexProviderWithAuth>
  );
}
