from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "frontend" / "src" / "App.js").read_text(encoding="utf-8")
METADATA = (
    ROOT / "frontend" / "src" / "components" / "rmc" / "RouteMetadata.jsx"
).read_text(encoding="utf-8")
GAMES = (ROOT / "frontend" / "src" / "lib" / "games.js").read_text(encoding="utf-8")


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
