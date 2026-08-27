from pathlib import Path


PUBLIC_INDEX = Path(__file__).resolve().parents[1] / "frontend" / "public" / "index.html"
FRONTEND_PACKAGE = Path(__file__).resolve().parents[1] / "frontend" / "package.json"
CRACO_CONFIG = Path(__file__).resolve().parents[1] / "frontend" / "craco.config.js"


def test_public_shell_has_no_emergent_browser_dependencies():
    html = PUBLIC_INDEX.read_text(encoding="utf-8")

    assert "assets.emergent.sh" not in html
    assert "ap.emergent.sh" not in html


def test_frontend_build_has_no_emergent_dependencies():
    package = FRONTEND_PACKAGE.read_text(encoding="utf-8")
    craco = CRACO_CONFIG.read_text(encoding="utf-8")

    assert "assets.emergent.sh" not in package
    assert "@emergentbase/visual-edits" not in package
    assert "@emergentbase/visual-edits" not in craco


def test_public_shell_does_not_publish_placeholder_verification():
    html = PUBLIC_INDEX.read_text(encoding="utf-8")

    assert "REPLACE_WITH_YOUR_SEARCH_CONSOLE_TOKEN" not in html


def test_session_recording_is_explicitly_disabled():
    html = PUBLIC_INDEX.read_text(encoding="utf-8")

    assert 'api_host: "https://us.i.posthog.com"' in html
    assert "posthog.stopSessionRecording();" in html
    assert "session_recording:" not in html
