#!/usr/bin/env python3
"""Fail closed unless the signed Android build has its RevenueCat public key."""

from __future__ import annotations

import hashlib
import os
import re


ENV_NAME = "REACT_APP_REVENUECAT_ANDROID_KEY"


def fingerprint(value: str | None) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"goog_[!-~]+", value):
        raise ValueError("invalid_android_revenuecat_public_key")
    return hashlib.sha256(value.encode()).hexdigest()


def main() -> None:
    digest = fingerprint(os.environ.get(ENV_NAME))
    print(f"android_revenuecat_key_sha256={digest}")


if __name__ == "__main__":
    main()
