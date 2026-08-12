// Must be first so Sentry is initialised before the app renders.
import "./instrument";
import "./i18n";

import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/noto-sans-ethiopic/400.css";
import "@fontsource/noto-sans-ethiopic/700.css";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={<p>Something went wrong. Please refresh the page.</p>}
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
