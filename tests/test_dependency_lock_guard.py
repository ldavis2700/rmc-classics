"""Keep release installs locked to the reviewed npm dependency graph."""

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"


class DependencyLockGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package = json.loads((FRONTEND / "package.json").read_text())
        cls.lock = json.loads((FRONTEND / "package-lock.json").read_text())

    def test_lockfile_and_package_manager_are_explicit(self):
        self.assertEqual(self.lock["lockfileVersion"], 3)
        self.assertTrue(self.package["packageManager"].startswith("npm@10."))

    def test_build_paths_use_clean_locked_installs(self):
        paths = {
            ROOT / ".github/workflows/pr-validation.yml": 1,
            ROOT / ".github/workflows/ios-build.yml": 1,
            ROOT / "codemagic.yaml": 2,
        }
        for path, expected in paths.items():
            with self.subTest(path=path.name):
                contents = path.read_text()
                self.assertEqual(contents.count("npm ci"), expected)
                self.assertNotIn("yarn install", contents)
                self.assertNotIn("yarn build", contents)

    def test_native_and_calendar_peers_are_supported(self):
        dependencies = self.package["dependencies"]
        self.assertEqual(dependencies["@revenuecat/purchases-capacitor"], "11.3.0")
        self.assertEqual(dependencies["react-day-picker"], "9.13.2")
        self.assertEqual(self.package["devDependencies"]["typescript"], "4.9.5")
        self.assertEqual(self.package["devDependencies"]["eslint"], "8.57.1")

    def test_simple_yarn_resolutions_are_mirrored_for_npm(self):
        resolutions = self.package["resolutions"]
        overrides = self.package["overrides"]
        for name, version in resolutions.items():
            if name.startswith("**/"):
                continue
            with self.subTest(name=name):
                override = overrides[name]
                actual = override.get(".") if isinstance(override, dict) else override
                self.assertEqual(actual, version)

    def test_nested_security_resolutions_are_mirrored_for_npm(self):
        expected = {
            "resolve-url-loader": {"postcss": "8.5.28"},
            "axios": {"form-data": "4.0.6"},
            "jsdom": {"form-data": "3.0.5"},
            "postcss-svgo": {"svgo": "2.8.4"},
            "webpack-dev-server": {"ws": "8.21.0"},
            "postcss-load-config": {"yaml": "2.8.3"},
            "cosmiconfig": {"yaml": "1.10.3"},
            "cssnano": {"yaml": "1.10.3"},
            "eslint": {"js-yaml": "4.3.2"},
            "@eslint/eslintrc": {"js-yaml": "4.3.2"},
            "svgo": {"js-yaml": "3.15.2"},
            "@istanbuljs/load-nyc-config": {"js-yaml": "3.15.2"},
            "css-loader": {"postcss": "8.5.28"},
            "css-minimizer-webpack-plugin": {"postcss": "8.5.28"},
            "react-scripts": {"postcss": "8.5.28"},
            "filelist": {"minimatch": "5.1.8"},
            "anymatch": {"picomatch": "2.3.2"},
            "micromatch": {"picomatch": "2.3.2"},
            "readdirp": {"picomatch": "2.3.2"},
            "jest-util": {"picomatch": "2.3.2"},
            "tinyglobby": {"picomatch": "4.0.4"},
        }
        overrides = self.package["overrides"]
        for parent, children in expected.items():
            for child, version in children.items():
                with self.subTest(parent=parent, child=child):
                    self.assertEqual(overrides[parent][child], version)


if __name__ == "__main__":
    unittest.main()
