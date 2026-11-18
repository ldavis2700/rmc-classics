import importlib.util
import ast
import asyncio
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release_endpoints', ROOT / 'scripts/verify_release_endpoints.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
ORIGIN = 'https://rmcclassics.com'


def fixtures():
    pages = json.loads((ROOT / 'frontend/src/lib/public-route-metadata.json').read_text())
    result = {'/api/': ('application/json', '{"app":"RMC CLASSICS","status":"ok"}'),
              '/api/games/meta': ('application/json', '{"games":{"dominoes":{},"spades":{}}}')}
    for path in ('/privacy', '/terms', '/support'):
        result[path] = ('text/html', f'<title>{pages[path]["title"]}</title><link rel="canonical" href="{ORIGIN}{path}">')
    return result


class ReleaseEndpointGuardTests(unittest.TestCase):
    def verify(self, data):
        return gate.verify(ORIGIN, lambda url: data[url.removeprefix(ORIGIN)])

    def test_pass_is_explicitly_not_resubmission_readiness(self):
        result = self.verify(fixtures())
        self.assertFalse(result['resubmission_ready'])
        self.assertEqual(len(result['checked_paths']), 5)

    def test_bad_origin_rejected_before_request(self):
        for origin in ('http://rmcclassics.com', 'https://user:pass@rmcclassics.com',
                       ORIGIN + '/api', ORIGIN + '?token=x', ORIGIN + '#x'):
            with self.subTest(origin=origin), self.assertRaises(gate.GateError):
                gate.verify(origin, lambda _: self.fail('must not request'))

    def test_api_fallback_wrong_identity_malformed_or_missing_game_rejected(self):
        for path, response in [('/api/', ('text/html', '<html>Home</html>')),
                               ('/api/', ('application/json', '{"app":"pilot","status":"ok"}')),
                               ('/api/', ('application/json', '[')),
                               ('/api/', ('application/json', '[]')),
                               ('/api/games/meta', ('application/json', '{"games":{"dominoes":{}}}'))]:
            with self.subTest(response=response), self.assertRaises(gate.GateError):
                data = fixtures(); data[path] = response; self.verify(data)

    def test_home_fallback_wrong_canonical_and_duplicate_title_rejected(self):
        for html in ('<title>RMC CLASSICS</title>',
                     '<title>Privacy Policy | RMC CLASSICS</title><link rel="canonical" href="https://rmcclassics.com/">',
                     fixtures()['/privacy'][1] + '<title>Second</title>'):
            with self.subTest(html=html), self.assertRaises(gate.GateError):
                data = fixtures(); data['/privacy'] = ('text/html', html); self.verify(data)

    def test_redirect_rejected(self):
        with self.assertRaises(gate.GateError):
            gate.NoRedirect().redirect_request(None, None, 302, '', {}, ORIGIN)

    def test_unavailable_status_and_oversized_body_rejected(self):
        for status, body in ((503, b'unavailable'), (200, b'x' * (gate.MAX_BYTES + 1))):
            with self.subTest(status=status), patch.object(gate, 'build_opener') as opener:
                response = MagicMock(); response.status = status
                response.geturl.return_value = ORIGIN; response.read.return_value = body
                opener.return_value.open.return_value.__enter__.return_value = response
                with self.assertRaises(gate.GateError): gate.fetch(ORIGIN)

    def test_network_failure_is_not_success(self):
        with patch.object(gate, 'build_opener') as opener:
            opener.return_value.open.side_effect = gate.URLError('unavailable')
            with self.assertRaises(gate.GateError): gate.fetch(ORIGIN)

    def test_matching_source_still_does_not_prove_provider_or_resubmission(self):
        expected = gate.candidate_backend_fingerprint()
        data = fixtures()
        data['/api/release'] = ('application/json', json.dumps({
            'app': 'RMC CLASSICS', 'scope': 'source-fingerprint-only',
            'backend_source_sha256': expected}))
        result = gate.verify(ORIGIN, lambda url: data[url.removeprefix(ORIGIN)], expected)
        self.assertEqual(result['scope'], 'availability-and-source-match')
        self.assertIn('/api/release', result['checked_paths'])
        self.assertFalse(result['provider_provenance_verified'])
        self.assertFalse(result['resubmission_ready'])

    def test_stale_missing_malformed_or_wrong_app_source_is_rejected(self):
        valid = {'app': 'RMC CLASSICS', 'scope': 'source-fingerprint-only',
                 'backend_source_sha256': 'a' * 64}
        for response in ({}, {**valid, 'backend_source_sha256': 'b' * 64},
                         {**valid, 'backend_source_sha256': None},
                         {**valid, 'app': 'founding-pilot'}, {**valid, 'scope': 'signed'}):
            data = fixtures()
            data['/api/release'] = ('application/json', json.dumps(response))
            with self.subTest(response=response), self.assertRaises(gate.GateError):
                gate.verify(ORIGIN, lambda url: data[url.removeprefix(ORIGIN)], 'a' * 64)
        with self.assertRaises(gate.GateError):
            gate.verify(ORIGIN, lambda _: self.fail('must not request'), 'not-a-digest')

    def test_fingerprint_tracks_runtime_files_and_excludes_credentials_and_tests(self):
        spec = importlib.util.spec_from_file_location('identity', ROOT / 'backend/release_identity.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'server.py').write_text('print(1)')
            (root / 'requirements.txt').write_text('dependency==1')
            original = module.backend_source_fingerprint(root)
            (root / '.env').write_text('PRIVATE=must-not-be-read')
            (root / 'tests').mkdir(); (root / 'tests/test_runtime.py').write_text('test')
            self.assertEqual(original, module.backend_source_fingerprint(root))
            (root / 'server.py').write_text('print(2)')
            self.assertNotEqual(original, module.backend_source_fingerprint(root))
            (root / 'server.py').write_text('print(1)')
            (root / 'requirements.txt').write_text('dependency==2')
            self.assertNotEqual(original, module.backend_source_fingerprint(root))
            (root / 'requirements.txt').write_text('dependency==1')
            (root / 'new_module.py').write_text('new runtime code')
            self.assertNotEqual(original, module.backend_source_fingerprint(root))
            (root / 'new_module.py').unlink()
            self.assertEqual(original, module.backend_source_fingerprint(root))
            (root / 'server.py').rename(root / 'renamed.py')
            self.assertNotEqual(original, module.backend_source_fingerprint(root))

    def test_actual_route_returns_only_startup_source_identity(self):
        tree = ast.parse((ROOT / 'backend/server.py').read_text())
        route = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'release_identity')
        self.assertEqual(ast.literal_eval(route.decorator_list[0].args[0]), '/release')
        route.decorator_list = []
        namespace = {'BACKEND_SOURCE_FINGERPRINT': 'a' * 64}
        exec(compile(ast.Module(body=[route], type_ignores=[]), '<actual-release-route>', 'exec'), namespace)
        self.assertEqual(asyncio.run(namespace['release_identity']()), {
            'app': 'RMC CLASSICS', 'backend_source_sha256': 'a' * 64,
            'scope': 'source-fingerprint-only'})

    def test_preflight_precedes_install_and_signing(self):
        signed = (ROOT / 'codemagic.yaml').read_text().split('  ios-unsigned:', 1)[0]
        index = signed.index('name: Verify deployed release endpoints')
        for step in ('name: Install frontend deps', 'name: Fetch iOS signing files', 'name: Build .ipa'):
            self.assertLess(index, signed.index(step))
        self.assertIn('python3 scripts/verify_release_endpoints.py --origin "$REACT_APP_BACKEND_URL"', signed)
        self.assertIn('--origin "$REACT_APP_BACKEND_URL" --match-backend-source', signed)

    def test_github_fallback_checks_same_origin_before_signing(self):
        workflow = (ROOT / '.github/workflows/ios-build.yml').read_text()
        self.assertIn('REACT_APP_BACKEND_URL: https://rmcclassics.com', workflow)
        index = workflow.index('name: Verify deployed release endpoints')
        self.assertLess(index, workflow.index('name: Install frontend deps'))
        self.assertLess(index, workflow.index('name: Install Apple Distribution certificate'))
        self.assertIn('scripts/verify_release_endpoints.py --origin "$REACT_APP_BACKEND_URL"', workflow)
        self.assertIn('--origin "$REACT_APP_BACKEND_URL" --match-backend-source', workflow)
