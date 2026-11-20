"""Keep the native compile probe separate from signed distribution."""
from pathlib import Path
import unittest
import os
import subprocess
import tempfile
import tarfile
import plistlib
import yaml

ROOT = Path(__file__).resolve().parents[1]


class IOSReadinessGuardTests(unittest.TestCase):
    def setUp(self):
        self.text = (ROOT / '.github/workflows/ios-readiness.yml').read_text()
        self.workflow = yaml.safe_load(self.text)
        self.job = self.workflow['jobs']['ios-readiness']
        self.steps = self.job['steps']

    def test_no_release_authority_or_credentials(self):
        self.assertEqual(self.workflow['permissions'], {'contents': 'read'})
        self.assertNotIn('secrets.', self.text)
        self.assertNotIn('environment', self.job)
        commands = '\n'.join(s.get('run', '') for s in self.steps)
        for forbidden in ('upload_to_testflight', 'upload_to_app_store', 'altool',
                          'iTMSTransporter', '-exportArchive', 'fastlane release',
                          'security import', '-allowProvisioningUpdates'):
            self.assertNotIn(forbidden, commands)
        archive = next(s['run'] for s in self.steps if 'CODE_SIGNING_ALLOWED' in s.get('run', ''))
        for flag in ('CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=""'):
            self.assertIn(flag, archive)
        self.assertIn('Refusing signed output', archive)

    def test_exact_source_and_unsigned_evidence(self):
        checkout = self.steps[0]
        self.assertEqual(checkout['with']['ref'], '${{ env.SOURCE_COMMIT }}')
        self.assertFalse(checkout['with']['persist-credentials'])
        self.assertIn('git rev-parse HEAD', self.text)
        uploads = [s for s in self.steps if s.get('uses', '').startswith('actions/upload-artifact@')]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(set(uploads[0]['with']['path'].splitlines()), {
            '${{ runner.temp }}/ios-readiness.txt',
            '${{ runner.temp }}/RMC-unsigned-readiness.tar.gz',
            '${{ runner.temp }}/ios-readiness-SHA256SUMS',
        })
        self.assertEqual(uploads[0]['with']['retention-days'], 14)
        self.assertNotIn('if', uploads[0])  # never retain a failed signing guard's output
        self.assertEqual(uploads[0]['with']['if-no-files-found'], 'error')
        self.assertIn('signing_state=unsigned-readiness-only', self.text)
        self.assertIn('com.rmcclassics.app', self.text)
        self.assertIn('shasum -a 256', self.text)
        for step in self.steps:
            if 'uses' in step:
                self.assertRegex(step['uses'], r'@\w{40}$')

    def test_archive_packaging_round_trip_and_tamper_detection(self):
        command = next(s['run'] for s in self.steps
                       if s.get('name') == 'Package unsigned archive for independent verification')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = root / 'RMC-readiness.xcarchive/Products/Applications/App.app'
            app.mkdir(parents=True)
            binary = app / 'App'
            binary.write_bytes(b'unsigned fixture, not a native build')
            binary.chmod(0o755)
            (root / 'ios-readiness.txt').write_text('signing_state=unsigned-readiness-only\n')
            env = dict(os.environ, RUNNER_TEMP=directory)
            subprocess.run(['bash', '-c', command], env=env, check=True, capture_output=True)
            with tarfile.open(root / 'RMC-unsigned-readiness.tar.gz') as archive:
                member = archive.getmember('RMC-readiness.xcarchive/Products/Applications/App.app/App')
                self.assertEqual(archive.extractfile(member).read(), binary.read_bytes())
                self.assertEqual(member.mode & 0o777, 0o755)
            (root / 'ios-readiness.txt').write_text('tampered')
            check = subprocess.run(['shasum', '-a', '256', '-c', 'ios-readiness-SHA256SUMS'],
                                   cwd=root, capture_output=True)
            self.assertNotEqual(check.returncode, 0)
            binary.unlink()
            missing = subprocess.run(['bash', '-c', command], env=env, capture_output=True)
            self.assertNotEqual(missing.returncode, 0)

    def test_app_preferences_privacy_manifest_is_bundled(self):
        manifest = ROOT / 'frontend/ios/App/App/PrivacyInfo.xcprivacy'
        data = plistlib.loads(manifest.read_bytes())
        self.assertEqual(data['NSPrivacyAccessedAPITypes'], [{
            'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryUserDefaults',
            'NSPrivacyAccessedAPITypeReasons': ['CA92.1'],
        }])
        project = (ROOT / 'frontend/ios/App/App.xcodeproj/project.pbxproj').read_text()
        resource_phase = project.split('/* Begin PBXResourcesBuildPhase section */')[1].split('/* End PBXResourcesBuildPhase section */')[0]
        self.assertIn('A71200012026111900000001 /* PrivacyInfo.xcprivacy in Resources */', resource_phase)
        self.assertIn('fileRef = A71200012026111900000002', project)
        self.assertIn('path = PrivacyInfo.xcprivacy;', project)
        self.assertIn('plutil -lint "$APP/PrivacyInfo.xcprivacy"', self.text)
        self.assertIn('Print :NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPITypeReasons:0', self.text)

    def test_locked_install_and_explicit_origin(self):
        build = next(s for s in self.steps if s.get('working-directory') == 'frontend')
        self.assertIn('npm ci', build['run'])
        self.assertIn('cap sync ios', build['run'])
        self.assertEqual(build['env']['REACT_APP_BACKEND_URL'], 'https://rmcclassics.com')
        self.assertIn('CODE_SIGNING_ALLOWED=NO', self.text)
        self.assertEqual(self.job['timeout-minutes'], 30)
        self.assertIn('Gem.bin_path("cocoapods", "pod", ENV.fetch("COCOAPODS_VERSION"))', self.text)
        self.assertIn('>> "$GITHUB_PATH"', self.text)
        activation = 'gem "cocoapods", ENV.fetch("COCOAPODS_VERSION")'
        loader = 'load Gem.bin_path'
        self.assertIn(activation, self.text)
        self.assertLess(self.text.index(activation), self.text.index(loader))


if __name__ == '__main__':
    unittest.main()
