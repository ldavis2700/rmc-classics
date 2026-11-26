"""Evidence that every required isolated browser process exited successfully.

This is CI execution evidence, never production or signed-device acceptance.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

STAGES = (
    ('verify-computer-spades-browser.cjs', 150),
    ('verify-computer-dominoes-browser.cjs', 120),
    ('verify-scrabble-browser.cjs', 120),
    ('verify-ludo-browser.cjs', 180),
    ('verify-snakes-browser.cjs', 120),
    ('verify-jenga-browser.cjs', 180),
    ('verify-crazy8-browser.cjs', 120),
    ('verify-table-browser.cjs', 480),
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def identity(root, env):
    return dict(candidate_commit=env.get('RMC_CAPTURE_CANDIDATE', 'local'),
                run_id=env.get('GITHUB_RUN_ID', 'local'),
                run_attempt=env.get('GITHUB_RUN_ATTEMPT', 'local'),
                web_manifest_sha256=digest(root / 'frontend/build/rmc-release.json'))


def expected_stages(root):
    return [dict(script=name, timeout_seconds=timeout,
                 source_sha256=digest(root / 'scripts' / name), exit_code=0)
            for name, timeout in STAGES]


def validate(data, root, env):
    expected = dict(schema=1, scope='isolated-ci-browser-processes',
                    signed_device_validation=False, production_deployment_verified=False,
                    **identity(root, env), stages=expected_stages(root))
    if data != expected:
        raise ValueError('Browser acceptance incomplete, duplicated, stale, failed or mismatched')


class Acceptance:
    def __init__(self, root, env):
        self.root, self.env = Path(root), env
        self.path = Path(env['RMC_BROWSER_ACCEPTANCE']) if env.get('RMC_BROWSER_ACCEPTANCE') else None
        if self.path:
            self.path.unlink(missing_ok=True)  # A failed attempt cannot reuse an old receipt.
        self.stages = []
        self.failed = False
        self.started_identity = identity(self.root, env)
        self.expected = expected_stages(self.root)

    def run(self, name, timeout):
        index = len(self.stages)
        if self.failed or index >= len(STAGES) or (name, timeout) != STAGES[index]:
            self.failed = True
            raise ValueError('Missing, duplicate, reordered or unexpected browser stage')
        try:
            subprocess.run(['node', 'scripts/' + name], cwd=self.root,
                           env=self.env, check=True, timeout=timeout)
        except BaseException:
            self.failed = True
            raise
        self.stages.append(self.expected[index])

    def finish(self):
        if self.failed:
            raise ValueError('Failed browser execution cannot produce acceptance')
        data = dict(schema=1, scope='isolated-ci-browser-processes',
                    signed_device_validation=False, production_deployment_verified=False,
                    **self.started_identity, stages=self.stages)
        validate(data, self.root, self.env)
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(data, indent=2) + '\n')
            temporary.replace(self.path)
        print('PASS: all eight required browser stages completed; acceptance receipt validated', flush=True)
        return data


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    for key in ('RMC_CAPTURE_CANDIDATE', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'RMC_BROWSER_ACCEPTANCE'):
        if not os.environ.get(key):
            raise SystemExit('Missing acceptance identity: ' + key)
    validate(json.loads(Path(os.environ['RMC_BROWSER_ACCEPTANCE']).read_text()), root, os.environ)
    print('PASS: browser acceptance matches candidate, attempt, scripts and web manifest')
