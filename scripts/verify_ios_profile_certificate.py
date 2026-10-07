#!/usr/bin/env python3
"""Require the signed IPA leaf certificate to be authorized by its profile."""

from __future__ import annotations

import argparse
import hashlib
import plistlib
from pathlib import Path


class CertificateProfileError(ValueError):
    pass


def verify_profile_certificate(profile: dict, certificate: bytes) -> str:
    if not certificate:
        raise CertificateProfileError("signing certificate is empty")
    certificates = profile.get("DeveloperCertificates")
    if not isinstance(certificates, list) or not certificates:
        raise CertificateProfileError(
            "provisioning profile has no developer certificates"
        )
    leaf_digest = hashlib.sha256(certificate).hexdigest()
    authorized = {
        hashlib.sha256(bytes(item)).hexdigest()
        for item in certificates
        if isinstance(item, (bytes, bytearray)) and item
    }
    if leaf_digest not in authorized:
        raise CertificateProfileError(
            "signed IPA certificate is not authorized by the provisioning profile"
        )
    return leaf_digest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True, type=Path)
    parser.add_argument("--certificate", required=True, type=Path)
    args = parser.parse_args()
    try:
        with args.profile.open("rb") as handle:
            profile = plistlib.load(handle)
        if not isinstance(profile, dict):
            raise CertificateProfileError("profile is not a plist dictionary")
        digest = verify_profile_certificate(
            profile, args.certificate.read_bytes()
        )
    except (OSError, plistlib.InvalidFileException, CertificateProfileError) as exc:
        print(f"ERROR: {exc}")
        return 1
    print(f"Verified provisioning-profile certificate binding: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
