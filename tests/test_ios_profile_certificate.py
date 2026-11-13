import unittest
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
