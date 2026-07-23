import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const posthogKey = process.env.REACT_APP_POSTHOG_KEY?.trim();
if (posthogKey && window.posthog) {
  window.posthog.init(posthogKey, {
    api_host: process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    session_recording: {
      recordCrossOriginIframes: true,
      capturePerformance: false,
    },
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('ServiceWorker registered:', registration.scope);
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}
