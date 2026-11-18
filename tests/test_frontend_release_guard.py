import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import verify_frontend_release as gate


class FrontendReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'static/js').mkdir(parents=True)
        (self.root / 'index.html').write_text('<script src="/static/js/main.123.js"></script>')
        (self.root / 'static/js/main.123.js').write_text('console.log("RMC")')
        self.generate()
        self.manifest = json.loads((self.root / 'rmc-release.json').read_text())
        self.responses = {'/' + p: (self.root / p).read_bytes() for p in self.manifest['files']}
        self.responses['/rmc-release.json'] = (self.root / 'rmc-release.json').read_bytes()

    def generate(self):
        return subprocess.run(['node', str(ROOT / 'frontend/scripts/generate-release-manifest.mjs')],
            env={**os.environ, 'RMC_BUILD_DIR': str(self.root)}, capture_output=True, check=True)

    def get(self, url):
        return self.responses[url.removeprefix('https://rmcclassics.com')]

    def test_exact_build_and_assets_match_without_claiming_readiness(self):
        result = gate.verify('https://rmcclassics.com', self.manifest, self.get)
        self.assertEqual(result['verified_files'], 2)
        self.assertFalse(result['provider_provenance_verified'])
        self.assertFalse(result['resubmission_ready'])
        self.generate()
        self.assertEqual(self.manifest, json.loads((self.root / 'rmc-release.json').read_text()))

    def test_matching_manifest_cannot_hide_stale_or_fallback_assets(self):
        for asset in ('/index.html', '/static/js/main.123.js'):
            for bad in (b'<html>pilot fallback</html>', b'old release'):
                with self.subTest(asset=asset), self.assertRaises(gate.GateError):
                    gate.verify('https://rmcclassics.com', self.manifest,
                                lambda url: bad if url.endswith(asset) else self.get(url))

    def test_stale_pilot_or_malformed_manifest_rejected(self):
        for data in (b'{}', b'<html>pilot</html>', b'[]'):
            with self.subTest(data=data), self.assertRaises(gate.GateError):
                gate.verify('https://rmcclassics.com', self.manifest, lambda _: data)

    def test_unsafe_manifest_paths_and_origins_never_requested(self):
        for path in ('../secret.js', '/static/js/main.x.js', 'https://other/main.js', 'x/../a.js', 'a?token=x.js'):
            manifest = copy.deepcopy(self.manifest)
            manifest['files'][path] = 'a' * 64
            with self.subTest(path=path), self.assertRaises(gate.GateError):
                gate.verify('https://rmcclassics.com', manifest, lambda _: self.fail('requested unsafe path'))
        for origin in ('http://rmcclassics.com', 'https://user:pass@rmcclassics.com', 'https://rmcclassics.com/path'):
            with self.assertRaises(gate.GateError):
                gate.verify(origin, self.manifest, lambda _: self.fail('requested unsafe origin'))

    def test_missing_main_bundle_prevents_manifest_generation(self):
        (self.root / 'static/js/main.123.js').unlink()
        with self.assertRaises(subprocess.CalledProcessError):
            self.generate()

    def test_asset_network_failure_does_not_pass(self):
        def unavailable(url):
            if url.endswith('.js'): raise OSError('unavailable')
            return self.get(url)
        with self.assertRaises(OSError):
            gate.verify('https://rmcclassics.com', self.manifest, unavailable)
