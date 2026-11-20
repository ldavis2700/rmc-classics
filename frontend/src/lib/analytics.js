// Lightweight Google Analytics 4 helper.
// Loads gtag only if REACT_APP_GA_MEASUREMENT_ID is set in the frontend .env file.

let initialized = false;

// Report screen categories, never room IDs, query strings, fragments, or a
// caller-controlled origin. This is a reporting URL, not deployment evidence.
function analyticsPage(path) {
  const category = typeof path === "string" && path.startsWith("/")
    ? path.split(/[/?#]/)[1] : "";
  const screens = ["library", "play", "battle", "battles", "friends", "leaderboard",
    "profile", "login", "register", "privacy", "terms", "support", "support-rmc"];
  const pagePath = screens.includes(category) ? `/${category}` : "/";
  return {
    page_path: pagePath,
    page_location: `https://rmcclassics.com${pagePath}`,
    page_referrer: "",
    page_title: "RMC CLASSICS",
  };
}

export function initAnalytics() {
  if (initialized || typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const id = process.env.REACT_APP_GA_MEASUREMENT_ID;
    if (!id) return; // silently skip in dev/no-config
    const s = document.createElement("script");
    s.async = true;
    s.referrerPolicy = "no-referrer";
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", id, {
      ...analyticsPage(window.location?.pathname),
      send_page_view: false,
    });
    // Queue safe configuration before the asynchronous SDK can execute.
    document.head.appendChild(s);
    initialized = true;
  } catch {
    // Optional telemetry must not prevent the React app from mounting.
  }
}

export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;

  // A provider failure must not abort checkout, sharing, or the other provider.
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, { ...params, ...analyticsPage(window.location?.pathname) });
    }
  } catch {
    // Best-effort analytics only; do not log potentially sensitive payloads.
  }

  try {
    const posthog = window.posthog;
    if (
      typeof posthog?.capture === "function" &&
      posthog.has_opted_out_capturing?.() !== true
    ) {
      posthog.capture(name, params);
    }
  } catch {
    // Includes errors from the SDK's opt-out check: fail closed for this event.
  }
}

export function trackPageview(path) {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag !== "function") return;
    const id = process.env.REACT_APP_GA_MEASUREMENT_ID;
    if (!id) return;
    const page = analyticsPage(path);
    // Enhanced Measurement must also be disabled/verified in the provider's
    // stream settings; send_page_view alone does not control history events.
    window.gtag("config", id, { ...page, send_page_view: false });
    window.gtag("event", "page_view", page);
  } catch {
    // Route changes must remain usable when analytics is unavailable.
  }
}
