"""Keep the native compile probe separate from signed distribution."""
from pathlib import Path
import unittest
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

    def test_exact_source_and_receipt_only(self):
        checkout = self.steps[0]
        self.assertEqual(checkout['with']['ref'], '${{ env.SOURCE_COMMIT }}')
        self.assertFalse(checkout['with']['persist-credentials'])
        self.assertIn('git rev-parse HEAD', self.text)
        uploads = [s for s in self.steps if s.get('uses', '').startswith('actions/upload-artifact@')]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(uploads[0]['with']['path'], '${{ runner.temp }}/ios-readiness.txt')
        self.assertEqual(uploads[0]['with']['if-no-files-found'], 'error')
        self.assertIn('signing_state=unsigned-readiness-only', self.text)
        self.assertIn('com.rmcclassics.app', self.text)
        self.assertIn('shasum -a 256', self.text)
        for step in self.steps:
            if 'uses' in step:
                self.assertRegex(step['uses'], r'@\w{40}$')

    def test_locked_install_and_explicit_origin(self):
        build = next(s for s in self.steps if s.get('working-directory') == 'frontend')
        self.assertIn('npm ci', build['run'])
        self.assertIn('cap sync ios', build['run'])
        self.assertEqual(build['env']['REACT_APP_BACKEND_URL'], 'https://rmcclassics.com')
        self.assertIn('CODE_SIGNING_ALLOWED=NO', self.text)
        self.assertEqual(self.job['timeout-minutes'], 30)


if __name__ == '__main__':
    unittest.main()
