const DEFAULT_PUBLIC_APP_URL = "https://rmcclassics.com";

export function publicAppBaseUrl(configured = process.env.REACT_APP_PUBLIC_APP_URL) {
  const candidate = (configured || DEFAULT_PUBLIC_APP_URL).trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || !parsed.hostname) return DEFAULT_PUBLIC_APP_URL;
    return parsed.origin;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

export function publicBattleInviteUrl(roomId) {
  return `${publicAppBaseUrl()}/battle/${encodeURIComponent(roomId || "")}`;
}

export function publicGameUrl(gamePath) {
  const safePath =
    typeof gamePath === "string" && /^\/play\/[a-z0-9-]+$/.test(gamePath)
      ? gamePath
      : "/library";
  return `${publicAppBaseUrl()}${safePath}`;
}

export function publicGameShareUrl(gamePath) {
  const url = new URL(publicGameUrl(gamePath));
  url.searchParams.set("ref", "player-share");
  return url.toString();
}

export function safeReturnPath(value, fallback = "/profile") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}
