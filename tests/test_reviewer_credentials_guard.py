"""Fail closed if reviewer credentials reappear in versioned release notes.

This is a source guard, not a claim that the previously exposed credential
has been rotated or removed from Git history.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
NOTES = ROOT / "memory" / "app_review_notes.md"


class ReviewerNotesSafetyTests(unittest.TestCase):
    def test_reviewer_auth_fields_contain_instructions_not_credentials(self):
        text = NOTES.read_text(encoding="utf-8")
        fields = re.findall(
            r"^\|\s*(Username|Password)\s*\|\s*(.*?)\s*\|\s*$"
            r"|^\s*-\s*(Username|Password):\s*(.*?)\s*$",
            text, re.MULTILINE | re.IGNORECASE,
        )
        self.assertIn("Never put reviewer passwords in this repository", text)
        self.assertIn("App Store Connect’s private fields".replace("’", "'"), text)
        for table_field, table_value, list_field, list_value in fields:
            value = (table_value or list_value).strip()
            self.assertTrue(
                value.startswith("*( " ) or value.startswith("*("),
                f"{table_field or list_field} must describe secure manual entry, "
                "not contain a credential",
            )
            self.assertRegex(value.lower(), r"rotat|private|never commit")
            self.assertNotIn("@", value)

    def test_review_copy_matches_fifteen_game_candidate(self):
        text = NOTES.read_text(encoding="utf-8")
        self.assertIn("The catalog contains 15 games", text)
        self.assertIn("Dominoes, Spades, Go Fish", text)
        self.assertIn("not ready to paste or submit", text)
        self.assertIn("founding-pilot preview is insufficient", text)


if __name__ == "__main__":
    unittest.main()
