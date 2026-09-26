import "./styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { isViewRoute } from "./lib/remoteReadme";
import { ViewPage } from "./view/ViewPage";

// Cloudflare Web Analytics — a privacy-first JS beacon (no cookies). Because it
// only fires from real browsers that execute JS, it counts human page views and
// ignores crawlers/bots. Loads only when a beacon token is configured at build
// time (VITE_CF_BEACON_TOKEN), so dev and untokened builds stay clean.
const cfBeaconToken = import.meta.env.VITE_CF_BEACON_TOKEN;
if (cfBeaconToken) {
  const beacon = document.createElement("script");
  beacon.defer = true;
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.setAttribute("data-cf-beacon", JSON.stringify({ token: cfBeaconToken }));
  document.head.appendChild(beacon);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Two pages, no router: the editor, and read-only share links
// (/view?url=…, /link?url=…, /gh/<owner>/<repo>).
createRoot(root).render(
  <StrictMode>{isViewRoute(window.location.pathname) ? <ViewPage /> : <App />}</StrictMode>,
);
