// Lightweight Google Analytics 4 helper.
// Loads gtag only if REACT_APP_GA_MEASUREMENT_ID is set in the frontend .env file.

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  const id = process.env.REACT_APP_GA_MEASUREMENT_ID;
  if (!id) return; // silently skip in dev/no-config
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", id, { send_page_view: true });
  initialized = true;
}

export function trackEvent(name, params = {}) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}

export function trackPageview(path) {
  if (typeof window === "undefined" || !window.gtag) return;
  const id = process.env.REACT_APP_GA_MEASUREMENT_ID;
  if (!id) return;
  window.gtag("config", id, { page_path: path });
}
