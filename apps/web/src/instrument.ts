import {
  init,
  reactRouterV7BrowserTracingIntegration,
  replayIntegration,
} from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

// VITE_ vars are inlined at build time. Sentry self-disables when the DSN is
// empty, so dev builds without it just no-op.
const dsn = import.meta.env.VITE_SENTRY_DSN_WEB;

if (dsn) {
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:4899";
  init({
    dsn,
    // || (not ??) so an empty build-arg falls through to MODE.
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: true,
    integrations: [
      // Route-aware transactions for React Router v7 declarative routing.
      reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      replayIntegration(),
    ],
    tracesSampleRate: Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1,
    ),
    // Propagate trace headers to the API so frontend + backend traces link up.
    tracePropagationTargets: ["localhost", apiBase],
    // Replay only when an error occurs — negligible overhead otherwise.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
