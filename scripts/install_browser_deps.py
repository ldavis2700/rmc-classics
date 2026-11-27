"""Install Chromium OS dependencies using a temporary APT source snapshot.

The hosted runner's unrelated Microsoft Ubuntu feed can return HTTP 403.
Exclude only that feed; retain all other sources and signature verification.
Never edit /etc/apt. Browser downloads still run separately as the normal user.
"""
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit


def microsoft_ubuntu(url):
    parsed = urlsplit(url)
    return parsed.scheme == 'https' and parsed.netloc == 'packages.microsoft.com' and parsed.path.startswith('/ubuntu/')


def source_snapshot(text, suffix):
    if suffix == '.sources':
        kept = []
        for stanza in re.split(r'\n\s*\n', text):
            urls = []
            collecting = False
            for line in stanza.splitlines():
                if line.startswith('URIs:'):
                    urls.extend(line[5:].split()); collecting = True
                elif collecting and line.startswith((' ', '\t')):
                    urls.extend(line.split())
                else:
                    collecting = False
            matching = [microsoft_ubuntu(url) for url in urls]
            if any(matching):
                if not all(matching):
                    raise ValueError('Mixed Microsoft/non-Microsoft source stanza; refusing to change it')
                continue
            kept.append(stanza)
        return '\n\n'.join(kept)
    lines = []
    for line in text.splitlines(keepends=True):
        match = re.match(r'^\s*deb(?:-src)?\s+(?:\[[^]]*\]\s+)?(\S+)', line)
        if match and microsoft_ubuntu(match.group(1)):
            continue
        lines.append(line)
    return ''.join(lines)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 3:
        raise SystemExit('Run with sudo: install_browser_deps.py NODE PLAYWRIGHT_CLI')
    if os.environ.get('APT_CONFIG'):
        raise SystemExit('Existing APT_CONFIG requires review; refusing to replace it')
    with tempfile.TemporaryDirectory(prefix='rmc-browser-apt-') as temp:
        root = Path(temp); root.chmod(0o755)
        parts = root / 'sources.list.d'; parts.mkdir(mode=0o755)
        original = Path('/etc/apt/sources.list')
        main_list = root / 'sources.list'
        main_list.write_text(source_snapshot(original.read_text(), '.list') if original.exists() else '')
        for source in Path('/etc/apt/sources.list.d').iterdir():
            if source.is_file() and source.suffix in {'.list', '.sources'}:
                (parts / source.name).write_text(source_snapshot(source.read_text(), source.suffix))
        config = root / 'apt.conf'
        config.write_text(f'Dir::Etc::sourcelist "{main_list}";\nDir::Etc::sourceparts "{parts}";\n')
        env = dict(os.environ, APT_CONFIG=str(config))
        subprocess.run([sys.argv[1], sys.argv[2], 'install-deps', 'chromium'], env=env, check=True)
    print('PASS: browser OS dependencies installed; original APT sources untouched')


if __name__ == '__main__':
    main()
