import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { GAMES } from "@/lib/games";

const SITE_URL = "https://rmcclassics.com";
const DEFAULT_TITLE = "RMC CLASSICS — Remembering My Childhood";
const DEFAULT_DESCRIPTION =
  "Play 14 classic childhood games online, challenge friends, and climb the RMC CLASSICS leaderboards.";

const PUBLIC_ROUTES = {
  "/": {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  "/library": {
    title: "Classic Games Library | RMC CLASSICS",
    description:
      "Browse and play 14 classic childhood games online, including Chess, Checkers, Dominoes, Ludo, and Tumble Tower.",
  },
  "/leaderboard": {
    title: "Classic Games Leaderboards | RMC CLASSICS",
    description:
      "See the leading RMC CLASSICS players across daily challenges and 14 classic online games.",
  },
  "/support-rmc": {
    title: "Support RMC CLASSICS",
    description:
      "Support the independent development of RMC CLASSICS and help keep classic games available online.",
  },
  "/privacy": {
    title: "Privacy Policy | RMC CLASSICS",
    description: "Read the RMC CLASSICS privacy policy.",
  },
  "/terms": {
    title: "Terms of Use | RMC CLASSICS",
    description: "Read the RMC CLASSICS terms of use.",
  },
  "/support": {
    title: "Help & Support | RMC CLASSICS",
    description: "Get help with RMC CLASSICS accounts, games, purchases, and safety features.",
  },
};

const PRIVATE_ROUTE_PREFIXES = [
  "/account",
  "/battle/",
  "/battles",
  "/friends",
  "/login",
  "/profile",
  "/register",
];

function setMeta(selector, attribute, value) {
  document.querySelector(selector)?.setAttribute(attribute, value);
}

function ensureRobotsMeta() {
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement("meta");
    robots.setAttribute("name", "robots");
    document.head.appendChild(robots);
  }
  return robots;
}

export function metadataForPath(pathname) {
  const game = GAMES.find(({ path }) => path === pathname);
  if (game) {
    return {
      title: `${game.name} Online | RMC CLASSICS`,
      description: `Play ${game.name} online at RMC CLASSICS. ${game.description}`,
      canonicalPath: game.path,
      robots: "index,follow",
    };
  }

  const page = PUBLIC_ROUTES[pathname];
  if (page) {
    return {
      ...page,
      canonicalPath: pathname,
      robots: "index,follow",
    };
  }

  const isPrivate = PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
  return {
    title: isPrivate ? "RMC CLASSICS" : DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonicalPath: "/",
    robots: "noindex,nofollow",
  };
}

export default function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const metadata = metadataForPath(pathname);
    const canonicalUrl = `${SITE_URL}${metadata.canonicalPath}`;

    document.title = metadata.title;
    setMeta('meta[name="description"]', "content", metadata.description);
    setMeta('link[rel="canonical"]', "href", canonicalUrl);
    setMeta('meta[property="og:title"]', "content", metadata.title);
    setMeta('meta[property="og:description"]', "content", metadata.description);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[name="twitter:title"]', "content", metadata.title);
    setMeta('meta[name="twitter:description"]', "content", metadata.description);
    ensureRobotsMeta().setAttribute("content", metadata.robots);
  }, [pathname]);

  return null;
}
