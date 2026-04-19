/**
 * DEPRECATED: This file is NOT used as the app entry point.
 * The real entry point is src/main.tsx, which sets up Clerk, Convex,
 * React Router, and all global providers before rendering <App />.
 *
 * This file renders a bare <App /> with none of those providers,
 * so using it would cause runtime crashes. It is kept only for
 * historical reference and should not be imported or referenced.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
