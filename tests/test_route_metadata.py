import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "frontend" / "src" / "App.js").read_text(encoding="utf-8")
METADATA = (
    ROOT / "frontend" / "src" / "components" / "rmc" / "RouteMetadata.jsx"
).read_text(encoding="utf-8")
GAMES = (ROOT / "frontend" / "src" / "lib" / "games.js").read_text(encoding="utf-8")
PUBLIC_INDEX = (ROOT / "frontend" / "public" / "index.html").read_text(encoding="utf-8")


def test_router_mounts_route_metadata_inside_browser_router():
    browser_router = APP.index("<BrowserRouter>")
    route_metadata = APP.index("<RouteMetadata />")
    routes = APP.index("<Routes>")

    assert browser_router < route_metadata < routes


def test_every_game_path_is_derived_from_authoritative_game_catalog():
    assert 'import { GAMES } from "@/lib/games";' in METADATA
    assert "GAMES.find(({ path }) => path === pathname)" in METADATA
    assert "canonicalPath: game.path" in METADATA
    assert GAMES.count('path: "/play/') == 14


def test_public_pages_are_indexable_and_private_routes_fail_closed():
    assert 'robots: "index,follow"' in METADATA
    assert 'robots: "noindex,nofollow"' in METADATA
    for route in ("/login", "/register", "/profile", "/account", "/friends", "/battles", "/battle/"):
        assert f'"{route}"' in METADATA


def test_route_metadata_updates_search_and_social_contracts():
    for selector in (
        'meta[name="description"]',
        'link[rel="canonical"]',
        'meta[property="og:title"]',
        'meta[property="og:description"]',
        'meta[property="og:url"]',
        'meta[name="twitter:title"]',
        'meta[name="twitter:description"]',
        'meta[name="robots"]',
    ):
        assert selector in METADATA


def test_structured_catalog_is_strict_truthful_json_ld():
    match = re.search(
        r'<script id="rmc-structured-data" type="application/ld\+json">\s*(.*?)\s*</script>',
        PUBLIC_INDEX,
        re.DOTALL,
    )
    assert match

    graph = json.loads(match.group(1))["@graph"]
    by_type = {entry["@type"]: entry for entry in graph}

    assert by_type["Organization"]["name"] == "RMC FAMILY ENTERPRISES LLC"
    assert by_type["SoftwareApplication"]["operatingSystem"] == "Web"
    assert by_type["SoftwareApplication"]["isAccessibleForFree"] is True
    assert by_type["SoftwareApplication"]["offers"]["price"] == "0"

    catalog = by_type["ItemList"]
    assert catalog["numberOfItems"] == 14
    assert len(catalog["itemListElement"]) == 14
    assert [item["position"] for item in catalog["itemListElement"]] == list(range(1, 15))

    catalog_paths = {item["url"].removeprefix("https://rmcclassics.com") for item in catalog["itemListElement"]}
    game_paths = set(re.findall(r'path: "(/play/[^"]+)"', GAMES))
    assert catalog_paths == game_paths

    serialized = json.dumps(graph).lower()
    for unsupported_claim in ("aggregateRating", "review", "downloadCount", "userInteractionCount"):
        assert unsupported_claim.lower() not in serialized
