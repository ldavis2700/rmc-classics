import unittest
import hashlib
import plistlib
import subprocess
import sys
import tempfile
from pathlib import Path

from scripts.verify_ios_profile_certificate import (
    CertificateProfileError,
    verify_profile_certificate,
)


class IosProfileCertificateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Synthetic self-signed DER fixture, not Apple signing/provider evidence.
        cls.fixture = tempfile.TemporaryDirectory()
        root = Path(cls.fixture.name)
        subprocess.run([
            'openssl', 'req', '-x509', '-newkey', 'ec', '-pkeyopt',
            'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1',
            '-subj', '/CN=RMC-Test-Fixture', '-keyout', str(root / 'key.pem'),
            '-outform', 'DER', '-out', str(root / 'certificate.der'),
        ], check=True, capture_output=True)
        cls.der = (root / 'certificate.der').read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.fixture.cleanup()

    def run_cli(self, profile_bytes, certificate_bytes, bad_output=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / 'profile.plist'
            certificate = root / 'leaf.cer'
            output = root / ('missing/digest' if bad_output else 'digest')
            profile.write_bytes(profile_bytes)
            certificate.write_bytes(certificate_bytes)
            result = subprocess.run([
                sys.executable, str(Path(__file__).resolve().parents[1] /
                                    'scripts/verify_ios_profile_certificate.py'),
                '--profile', str(profile), '--certificate', str(certificate),
                '--digest-file', str(output),
            ], text=True, capture_output=True)
            return result, output.read_text() if output.is_file() else None

    def test_real_der_binding_in_xml_and_binary_profiles(self):
        for fmt in (plistlib.FMT_XML, plistlib.FMT_BINARY):
            with self.subTest(fmt=fmt):
                result, digest = self.run_cli(plistlib.dumps({
                    'DeveloperCertificates': [b'other-certificate', self.der]
                }, fmt=fmt), self.der)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(digest, hashlib.sha256(self.der).hexdigest() + '\n')

    def test_cli_rejects_malformed_profiles_and_mismatches_without_digest(self):
        cases = [
            b'<?xml version="1.0"?><plist><dict>',
            b'bplist00broken',
            plistlib.dumps([]),
            plistlib.dumps({}),
            plistlib.dumps({'DeveloperCertificates': 'wrong-type'}),
            plistlib.dumps({'DeveloperCertificates': ['not-data']}),
            plistlib.dumps({'DeveloperCertificates': [b'wrong-certificate']}),
        ]
        for profile in cases:
            with self.subTest(profile=profile[:40]):
                result, digest = self.run_cli(profile, self.der)
                self.assertEqual(result.returncode, 1)
                self.assertIsNone(digest)
                self.assertIn('ERROR:', result.stdout)
                self.assertNotIn('Traceback', result.stderr)

    def test_cli_digest_write_failure_is_reported_without_success(self):
        result, digest = self.run_cli(plistlib.dumps({
            'DeveloperCertificates': [self.der]
        }), self.der, bad_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertIsNone(digest)
        self.assertNotIn('Verified', result.stdout)
        self.assertNotIn('Traceback', result.stderr)

    def test_function_rejects_wrong_input_types(self):
        for profile, certificate in (([], self.der), ({}, 'not-bytes')):
            with self.assertRaises(CertificateProfileError):
                verify_profile_certificate(profile, certificate)

    def test_accepts_leaf_certificate_present_in_profile(self):
        digest = verify_profile_certificate(
            {"DeveloperCertificates": [b"other", b"leaf"]}, b"leaf"
        )
        self.assertEqual(len(digest), 64)

    def test_rejects_missing_or_mismatched_certificate_binding(self):
        for profile in ({}, {"DeveloperCertificates": []},
                        {"DeveloperCertificates": [b"other"]}):
            with self.subTest(profile=profile):
                with self.assertRaises(CertificateProfileError):
                    verify_profile_certificate(profile, b"leaf")

    def test_rejects_empty_leaf_certificate(self):
        with self.assertRaises(CertificateProfileError):
            verify_profile_certificate(
                {"DeveloperCertificates": [b"leaf"]}, b""
            )

    def test_cli_writes_auditable_digest_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / "profile.plist"
            certificate = root / "leaf.cer"
            digest = root / "binding.sha256"
            profile.write_bytes(plistlib.dumps({
                "DeveloperCertificates": [b"leaf"]
            }))
            certificate.write_bytes(b"leaf")
            result = subprocess.run([
                sys.executable,
                str(Path(__file__).resolve().parents[1] / "scripts" /
                    "verify_ios_profile_certificate.py"),
                "--profile", str(profile),
                "--certificate", str(certificate),
                "--digest-file", str(digest),
            ], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertRegex(digest.read_text().strip(), r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
