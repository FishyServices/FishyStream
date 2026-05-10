import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ClerkProvider, useAuth } from "@clerk/react";
import { dark } from "@clerk/themes";
import { applyFishyTheme } from "@fishy/ui";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App } from "./App";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { WatchPage } from "./pages/WatchPage";
import { MoviesPage } from "./pages/MoviesPage";
import { TVShowsPage } from "./pages/TVShowsPage";
import { NewReleasesPage } from "./pages/NewReleasesPage";
import { MyListPage } from "./pages/MyListPage";
import { WatchHistoryPage } from "./pages/WatchHistoryPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { GlobalWatchlistProvider } from "./hooks/useWatchlist";
import { WatchProgressProvider } from "./hooks/useWatchProgress";
import { AppSettingsProvider } from "./hooks/useAppSettings";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={publishableKey}
      standardBrowser={!isNativeShell}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "oklch(0.62 0.1 182)",
          colorBackground: "rgba(18, 24, 32, 0.96)",
          colorInputBackground: "rgba(255,255,255,0.04)",
          colorInputText: "#f3f7fb",
          colorText: "#f3f7fb",
          colorTextSecondary: "rgba(243,247,251,0.72)",
          borderRadius: "0.75rem",
          fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
        }
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <AppSettingsProvider>
          <GlobalWatchlistProvider>
            <WatchProgressProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/sign-in/*" element={<SignInPage />} />
                  <Route path="/sign-up/*" element={<SignUpPage />} />
                  <Route path="/watch/:id" element={<WatchPage />} />
                  <Route path="/movies" element={<MoviesPage />} />
                  <Route path="/tv-shows" element={<TVShowsPage />} />
                  <Route path="/new-releases" element={<NewReleasesPage />} />
                  <Route path="/my-list" element={<MyListPage />} />
                  <Route path="/history" element={<WatchHistoryPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/" element={<App />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </WatchProgressProvider>
          </GlobalWatchlistProvider>
        </AppSettingsProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>
);
