"""Read-only availability gate, not deployment provenance or device acceptance."""
import argparse
import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 2 * 1024 * 1024


class GateError(ValueError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise GateError('Redirect rejected; verify the canonical deployment route')


class PageMetadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.titles = []
        self.canonicals = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'title':
            self.in_title = True
            self.titles.append('')
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonicals.append(attrs.get('href'))

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.titles[-1] += data


def fetch(url):
    request = Request(url, headers={'User-Agent': 'RMC-Release-Preflight/1.0'})
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            if response.status != 200 or response.geturl() != url:
                raise GateError('Expected HTTP 200 at the requested URL')
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise GateError('Response exceeds the preflight size limit')
            return response.headers.get_content_type(), body.decode('utf-8')
    except (HTTPError, URLError, TimeoutError, UnicodeError) as exc:
        # Do not print response bodies, headers, or potentially sensitive redirects.
        raise GateError(f'Endpoint request failed ({type(exc).__name__})') from exc


def verify(origin, get=fetch, expected_backend_fingerprint=None):
    parsed = urlsplit(origin)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
        raise GateError('Backend URL must be a credential-free HTTPS origin')
    origin = origin.rstrip('/')
    if expected_backend_fingerprint is not None:
        import re
        if not re.fullmatch(r'[0-9a-f]{64}', expected_backend_fingerprint):
            raise GateError('Expected backend fingerprint must be a SHA-256 digest')
    checked = []
    api_checks = [('/api/', 'identity'), ('/api/games/meta', 'catalog')]
    if expected_backend_fingerprint is not None:
        api_checks.append(('/api/release', 'release'))
    for path, expected in api_checks:
        media, body = get(origin + path)
        if media != 'application/json':
            raise GateError(f'{path}: expected JSON, not an HTML fallback')
        try:
            data = json.loads(body)
        except ValueError as exc:
            raise GateError(f'{path}: malformed JSON') from exc
        if not isinstance(data, dict):
            raise GateError(f'{path}: expected an object')
        if expected == 'identity' and (data.get('app') != 'RMC CLASSICS' or data.get('status') != 'ok'):
            raise GateError('Backend identity/status mismatch')
        if expected == 'catalog' and (not isinstance(data.get('games'), dict) or not {'dominoes', 'spades'} <= data['games'].keys()):
            raise GateError('Backend lacks the Dominoes/Spades catalog')
        if expected == 'release' and (data.get('app') != 'RMC CLASSICS' or
                data.get('scope') != 'source-fingerprint-only' or
                data.get('backend_source_sha256') != expected_backend_fingerprint):
            raise GateError('Running backend source does not match the candidate checkout')
        checked.append(path)
    metadata = json.loads((ROOT / 'frontend/src/lib/public-route-metadata.json').read_text())
    for path in ('/privacy', '/terms', '/support'):
        media, body = get(origin + path)
        page = PageMetadata()
        page.feed(body)
        if (media != 'text/html' or page.titles != [metadata[path]['title']] or
                page.canonicals != [origin + path]):
            raise GateError(f'{path}: route metadata mismatch; possible home-page fallback')
        checked.append(path)
    return {'origin': origin, 'checked_paths': checked,
            'scope': 'availability-and-source-match' if expected_backend_fingerprint else 'availability-only',
            'backend_source_sha256': expected_backend_fingerprint,
            'provider_provenance_verified': False,
            'resubmission_ready': False}


def candidate_backend_fingerprint():
    spec = importlib.util.spec_from_file_location('rmc_release_identity', ROOT / 'backend/release_identity.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.backend_source_fingerprint()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--match-backend-source', action='store_true',
                        help='Require the running backend to match this candidate source tree')
    args = parser.parse_args()
    try:
        expected = candidate_backend_fingerprint() if args.match_backend_source else None
        print(json.dumps(verify(args.origin, expected_backend_fingerprint=expected)))
    except (GateError, OSError) as exc:
        parser.exit(1, f'Release endpoint preflight failed: {exc}\n')


if __name__ == '__main__':
    main()
