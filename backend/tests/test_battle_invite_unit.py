"""Regression coverage for the native-to-web battle invitation funnel."""
from pathlib import Path


ROOT = Path(__file__).parents[2]
BATTLE = ROOT / "frontend" / "src" / "pages" / "BattlePlay.jsx"
APP = ROOT / "frontend" / "src" / "App.js"
LOGIN = ROOT / "frontend" / "src" / "pages" / "Login.jsx"
REGISTER = ROOT / "frontend" / "src" / "pages" / "Register.jsx"
NATIVE = ROOT / "frontend" / "src" / "lib" / "native.js"
ROUTES = ROOT / "frontend" / "src" / "lib" / "routes.js"


def test_invites_use_a_public_https_origin_and_encode_room_ids():
    source = ROUTES.read_text()
    assert 'DEFAULT_PUBLIC_APP_URL = "https://rmcclassics.com"' in source
    assert "REACT_APP_PUBLIC_APP_URL" in source
    assert ".trim()" in source
    assert '.replace(/\\/+$/, "")' in source
    assert "encodeURIComponent(roomId" in source
    assert 'return `${publicBase}/battle/${encodeURIComponent(roomId || "")}`;' in source


def test_battle_share_uses_native_bridge_not_capacitor_local_origin():
    source = BATTLE.read_text()
    assert 'import { share } from "@/lib/native"' in source
    assert 'import { publicBattleInviteUrl } from "@/lib/routes"' in source
    assert "const inviteUrl = publicBattleInviteUrl(roomId)" in source
    assert "await share({" in source
    assert "window.location.origin}/battle" not in source
    assert "await navigator.share({" not in source


def test_protected_routes_preserve_the_full_invite_destination():
    source = APP.read_text()
    assert "useLocation" in source
    assert "`${location.pathname}${location.search}${location.hash}`" in source
    assert '<Navigate to="/login" replace state={{ from }} />' in source


def test_login_and_registration_return_invited_players_to_the_battle():
    login = LOGIN.read_text()
    register = REGISTER.read_text()
    assert 'safeReturnPath(location.state?.from, "/profile")' in login
    assert "navigate(returnTo, { replace: true })" in login
    assert 'to="/register" state={{ from: returnTo }}' in login
    assert 'safeReturnPath(location.state?.from, "/library")' in register
    assert "navigate(returnTo, { replace: true })" in register
    assert 'to="/login" state={{ from: returnTo }}' in register


def test_return_paths_reject_external_or_protocol_relative_redirects():
    source = ROUTES.read_text()
    assert '!value.startsWith("/")' in source
    assert 'value.startsWith("//")' in source
    assert "return fallback" in source


def test_native_share_uses_capacitor_and_treats_cancellation_as_non_failure():
    source = NATIVE.read_text()
    assert 'import("@capacitor/share")' in source
    assert "await Share.share" in source
    assert 'includes("cancel")' in source
    assert "return false" in source
