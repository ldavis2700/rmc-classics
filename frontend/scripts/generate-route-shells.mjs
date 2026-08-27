import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, "..");
const BUILD_DIR = process.env.RMC_BUILD_DIR
  ? path.resolve(process.env.RMC_BUILD_DIR)
  : path.join(FRONTEND_DIR, "build");
const SITE_URL = "https://rmcclassics.com";

const source = await readFile(path.join(FRONTEND_DIR, "src", "lib", "games.js"), "utf8");
const indexHtml = await readFile(path.join(BUILD_DIR, "index.html"), "utf8");

const games = [...source.matchAll(/\{([\s\S]*?)\n  \},/g)]
  .map(([, block]) => {
    const field = (name) => block.match(new RegExp(`\\b${name}:\\s*"([^"]+)"`))?.[1];
    return {
      id: field("id"),
      name: field("name"),
      path: field("path"),
      description: field("description"),
    };
  })
  .filter(({ id, name, path: route, description }) => id && name && route && description);

if (games.length !== 14 || games.some((game) => game.path !== `/play/${game.id}`)) {
  throw new Error("Refusing to generate route shells: the authoritative 14-game catalog could not be parsed safely.");
}

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function replaceExactlyOnce(html, pattern, replacement, label) {
  const matches = html.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  if (matches?.length !== 1) {
    throw new Error(`Expected exactly one ${label}; found ${matches?.length ?? 0}.`);
  }
  return html.replace(pattern, replacement);
}

function gameShell(game) {
  const title = `${game.name} Online | RMC CLASSICS`;
  const description = `Play ${game.name} online at RMC CLASSICS. ${game.description}`;
  const canonicalUrl = `${SITE_URL}${game.path}`;
  const values = {
    title: escapeHtml(title),
    description: escapeHtml(description),
    canonicalUrl: escapeHtml(canonicalUrl),
  };

  let html = indexHtml;
  html = replaceExactlyOnce(html, /<title>[^<]*<\/title>/, `<title>${values.title}</title>`, "title");
  html = replaceExactlyOnce(html, /<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${values.description}" />`, "description");
  html = replaceExactlyOnce(html, /<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${values.canonicalUrl}" />`, "canonical");
  html = replaceExactlyOnce(html, /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${values.title}" />`, "Open Graph title");
  html = replaceExactlyOnce(html, /<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${values.description}" />`, "Open Graph description");
  html = replaceExactlyOnce(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${values.canonicalUrl}" />`, "Open Graph URL");
  html = replaceExactlyOnce(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${values.title}" />`, "Twitter title");
  html = replaceExactlyOnce(html, /<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${values.description}" />`, "Twitter description");
  return html;
}

const playDir = path.join(BUILD_DIR, "play");
await rm(playDir, { recursive: true, force: true });

for (const game of games) {
  const outputDir = path.join(playDir, game.id);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "index.html"), gameShell(game), "utf8");
}

process.stdout.write(`Generated ${games.length} truthful game route shells.\n`);
