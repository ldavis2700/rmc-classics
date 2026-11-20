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


def test_optional_analytics_failures_do_not_interrupt_user_actions():
    source = PUBLIC_INDEX.parents[1] / "src/lib/analytics.js"
    subprocess.run(["node", "-e", r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[1], 'utf8').replaceAll('export function', 'function');
const context = { process: {env: {REACT_APP_GA_MEASUREMENT_ID: 'G-TEST'}}, window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const fail = () => { throw new Error('blocked analytics'); };
let captures = 0, gaEvents = 0;
context.window.gtag = fail;
context.window.posthog = {capture: () => captures++};
assert.doesNotThrow(() => context.trackEvent('freeze_pack_checkout_started'));
assert.equal(captures, 1); // a failed GA call does not suppress PostHog
assert.doesNotThrow(() => context.trackPageview('/profile'));
context.window.gtag = () => gaEvents++;
context.window.posthog = {capture: fail};
assert.doesNotThrow(() => context.trackEvent('game_share_completed'));
assert.equal(gaEvents, 1);
context.window.posthog = {capture: () => captures++, has_opted_out_capturing: fail};
assert.doesNotThrow(() => context.trackEvent('freeze_pack_restore_started'));
assert.equal(captures, 1); // failed consent read must not capture
context.window.posthog.has_opted_out_capturing = () => true;
context.trackEvent('game_share_completed');
assert.equal(captures, 1);
context.document = {createElement: () => ({}), head: {appendChild: fail}};
assert.doesNotThrow(() => context.initAnalytics()); // mount can continue
let loads = 0;
context.document.head.appendChild = () => loads++;
context.initAnalytics();
context.initAnalytics();
assert.equal(loads, 1); // failure allows retry; success remains idempotent
delete context.window;
assert.doesNotThrow(() => context.initAnalytics());
assert.doesNotThrow(() => context.trackEvent('ignored'));
assert.doesNotThrow(() => context.trackPageview('/'));
""", str(source)], check=True, capture_output=True, text=True)


def test_posthog_filters_provider_urls_and_nested_properties():
    # Exercise the actual send hook, including SDK-added fields that the React
    # event helper never sees. Keep useful conversion/share fields and IDs.
    subprocess.run(["node", "-e", r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[1], 'utf8');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('posthog.init('));
let options;
const posthog = {__SV: 1, init: (_, config) => options = config, stopSessionRecording() {}};
vm.runInNewContext(script, {document: {}, window: {posthog}, posthog});
const sensitive = 'https://example.test/battle/private-table?invite=private#secret';
const event = {event: 'freeze_pack_purchase_completed', timestamp: '2026-11-20T00:00:00Z',
  properties: {
    token: 'test-project', distinct_id: 'test-browser', $session_id: 'test-session',
    $process_person_profile: false, $lib: 'web',
    product_id: 'rmc.freeze.pack5', placement: 'profile', platform: 'ios', credited: true,
    $current_url: sensitive, $pathname: '/battle/private-table', $referrer: sensitive,
    $initial_current_url: sensitive, $initial_referrer: sensitive, $session_entry_url: sensitive,
    utm_source: 'private-campaign', $initial_utm_source: 'private-campaign',
    $set: {$current_url: sensitive}, $set_once: {$initial_current_url: sensitive},
    unknown_future_sdk_property: sensitive, transaction_id: 'private-transaction',
  }};
const result = options.before_send(event);
assert.equal(result.event, event.event);
assert.equal(result.timestamp, event.timestamp);
assert.equal(result.properties.distinct_id, 'test-browser');
assert.equal(result.properties.$session_id, 'test-session');
assert.equal(result.properties.$process_person_profile, false);
assert.equal(result.properties.credited, true);
assert.equal(result.properties.product_id, 'rmc.freeze.pack5');
assert.equal(result.properties.placement, 'profile');
assert.equal(result.properties.platform, 'ios');
for (const key of Object.keys(event.properties).filter(k =>
    !['token','distinct_id','$session_id','$process_person_profile','$lib',
      'product_id','placement','platform','credited'].includes(k))) {
  assert.equal(Object.hasOwn(result.properties, key), false, key);
}
assert.equal(event.properties.$current_url, sensitive); // no mutation of SDK state
const share = options.before_send({event: 'game_share_completed', properties: {
  game_id: 'spades', share_method: 'native_web_or_clipboard', referral_source: 'player_share',
  partner: {url: sensitive}, channel: [sensitive], stage: Infinity,
}});
assert.equal(share.properties.game_id, 'spades');
assert.equal(share.properties.share_method, 'native_web_or_clipboard');
assert.equal(share.properties.referral_source, 'player_share');
assert.equal(Object.hasOwn(share.properties, 'partner'), false);
assert.equal(Object.hasOwn(share.properties, 'channel'), false);
assert.equal(Object.hasOwn(share.properties, 'stage'), false);
assert.equal(options.before_send(null), null);
assert.equal(options.before_send({event: 'bad'}), null);
const broken = {event: 'bad', properties: {}};
Object.defineProperty(broken.properties, 'product_id', {get() {throw new Error('bad property');}});
assert.equal(options.before_send(broken), null); // SDK hook errors cannot fall back to raw data
""", str(PUBLIC_INDEX)], check=True, capture_output=True, text=True)
