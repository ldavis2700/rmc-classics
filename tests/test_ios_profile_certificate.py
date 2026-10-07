import unittest

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


if __name__ == "__main__":
    unittest.main()
