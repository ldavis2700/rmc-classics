from pathlib import Path
import re
import subprocess


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
    assert not re.search(r"^\s*session_recording\s*:", html, re.MULTILINE)


def test_analytics_initialization_disables_automatic_capture():
    # Execute the actual inline initializer with a loaded SDK stub. No network
    # requests are made; this checks the options delivered before stopRecording.
    subprocess.run(["node", "-e", r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[1], 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const script = scripts.find(s => s.includes('posthog.init('));
let calls = [];
const posthog = { __SV: 1,
  init: (key, options) => calls.push(options),
  stopSessionRecording: () => calls.push('stop'),
};
vm.runInNewContext(script, {document: {}, window: {posthog}, posthog});
assert.equal(calls.length, 2);
for (const key of ['autocapture', 'capture_pageview', 'capture_pageleave']) {
  assert.equal(calls[0][key], false, key);
}
assert.equal(calls[0].disable_session_recording, true);
assert.equal(calls[0].person_profiles, 'never');
assert.equal(calls[1], 'stop');
""", str(PUBLIC_INDEX)], check=True, capture_output=True, text=True)
