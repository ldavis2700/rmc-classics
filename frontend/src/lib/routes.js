const DEFAULT_PUBLIC_APP_URL = "https://rmcclassics.com";

export function publicBattleInviteUrl(roomId) {
  const publicBase = (process.env.REACT_APP_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL)
    .trim()
    .replace(/\/+$/, "");
  return `${publicBase}/battle/${encodeURIComponent(roomId || "")}`;
}

export function safeReturnPath(value, fallback = "/profile") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}
