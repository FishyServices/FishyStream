import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ClerkProvider } from "@clerk/react";
import { dark } from "@clerk/themes";
import { applyFishyTheme } from "@fishy/ui";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
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

applyFishyTheme({
  mode: "dark",
  density:
    isNativeShell || window.matchMedia("(max-width: 768px)").matches ? "touch" : "comfortable"
});

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={publishableKey}
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
    <RouterProvider router={router} />
  </ClerkProvider>
);
