# Apple backend compliance completion

This change installs a one-time main-branch workflow that applies and validates the backend portions of the August 20, 2026 Apple Review remediation after PR #16's frontend fixes landed without the intended server patch.

The workflow fails closed if expected server anchors are missing and validates Python syntax plus the required Terms acceptance, account deletion, report, block, and moderation-index routes before committing the patch to main.
