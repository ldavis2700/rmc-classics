"""Read-only availability gate, not deployment provenance or device acceptance."""
import argparse
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


def verify(origin, get=fetch):
    parsed = urlsplit(origin)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or
            parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
        raise GateError('Backend URL must be a credential-free HTTPS origin')
    origin = origin.rstrip('/')
    checked = []
    for path, expected in [('/api/', 'identity'), ('/api/games/meta', 'catalog')]:
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
    return {'origin': origin, 'checked_paths': checked, 'scope': 'availability-only',
            'resubmission_ready': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.origin)))
    except (GateError, OSError) as exc:
        parser.exit(1, f'Release endpoint preflight failed: {exc}\n')


if __name__ == '__main__':
    main()
