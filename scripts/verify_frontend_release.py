"""Compare deployed frontend bytes to a locally retained candidate build manifest.

This is artifact matching, not provider provenance or signed-device acceptance.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, build_opener
from verify_release_endpoints import GateError, NoRedirect

MAX_BYTES = 20 * 1024 * 1024


def fetch_bytes(url):
    with build_opener(NoRedirect()).open(Request(url, headers={'User-Agent': 'RMC-Release-Preflight/1.0', 'Cache-Control': 'no-cache'}), timeout=15) as response:
        if response.status != 200 or response.geturl() != url:
            raise GateError('Expected HTTP 200 at requested asset URL')
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise GateError('Asset exceeds verification size limit')
        return data


def verify(origin, manifest, get=fetch_bytes):
    parsed = urlsplit(origin)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ('', '/')):
        raise GateError('Frontend URL must be a credential-free HTTPS origin')
    origin = origin.rstrip('/')
    if not isinstance(manifest, dict) or manifest.get('app') != 'RMC CLASSICS' or manifest.get('schema') != 1 or manifest.get('scope') != 'web-artifact-match-only':
        raise GateError('Invalid RMC frontend manifest identity')
    files = manifest.get('files')
    if not isinstance(files, dict) or not 2 <= len(files) <= 500 or 'index.html' not in files:
        raise GateError('Invalid frontend manifest file set')
    if not any(re.fullmatch(r'static/js/main\.[^/]+\.js', p) for p in files):
        raise GateError('Missing main-game JavaScript bundle')
    for name, digest in files.items():
        if (not re.fullmatch(r'[A-Za-z0-9_./-]+\.(html|js|css)', name)
                or any(part in ('', '.', '..') for part in name.split('/'))
                or not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest)):
            raise GateError('Invalid frontend asset path or digest')
    try:
        deployed = json.loads(get(origin + '/rmc-release.json'))
    except (ValueError, UnicodeError) as exc:
        raise GateError('Deployed manifest is not JSON') from exc
    if deployed != manifest:
        raise GateError('Deployed frontend manifest differs from candidate')
    total = 0
    for name, expected in files.items():
        data = get(origin + '/' + quote(name, safe='/'))
        total += len(data)
        if len(data) > MAX_BYTES or total > 200 * 1024 * 1024:
            raise GateError('Frontend verification size limit exceeded')
        if hashlib.sha256(data).hexdigest() != expected:
            raise GateError(f'Frontend asset mismatch: {name}')
    return {'origin': origin, 'scope': 'web-artifact-match-only', 'verified_files': len(files),
            'provider_provenance_verified': False, 'resubmission_ready': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.origin, json.loads(args.manifest.read_text()))))
    except (GateError, OSError, ValueError) as exc:
        # Do not echo redirect URLs, provider response bodies or local file contents.
        parser.exit(1, f'Frontend release verification failed ({type(exc).__name__})\n')


if __name__ == '__main__':
    main()
