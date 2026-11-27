import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('deps', Path(__file__).resolve().parents[1] / 'scripts/install_browser_deps.py')
deps = importlib.util.module_from_spec(spec); spec.loader.exec_module(deps)

class SourceIsolation(unittest.TestCase):
    def test_legacy_removes_only_exact_microsoft_feed(self):
        ubuntu = 'deb http://archive.ubuntu.com/ubuntu noble main\n'
        ms = 'deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/24.04/prod noble main\n'
        self.assertEqual(deps.source_snapshot(ubuntu+ms, '.list'), ubuntu)
    def test_unrelated_and_comments_preserved(self):
        value = '# https://packages.microsoft.com/ubuntu/24.04/prod\ndeb https://packages.microsoft.com/debian/12/prod bookworm main\ndeb https://packages.microsoft.com.example/ubuntu/24.04/prod noble main\n'
        self.assertEqual(deps.source_snapshot(value,'.list'),value)
    def test_deb822_preserves_ubuntu_signature_and_mirror(self):
        ubuntu = 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble\nComponents: main\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg'
        ms = 'Types: deb\nURIs: https://packages.microsoft.com/ubuntu/24.04/prod\nSuites: noble\nComponents: main'
        self.assertEqual(deps.source_snapshot(ms+'\n\n'+ubuntu,'.sources'),ubuntu)
    def test_mixed_stanza_fails_closed(self):
        with self.assertRaises(ValueError):
            deps.source_snapshot('URIs: https://packages.microsoft.com/ubuntu/24.04/prod\n http://archive.ubuntu.com/ubuntu\nSuites: noble','.sources')
    def test_failed_install_leaves_sources_unchanged_and_cleans_snapshot(self):
        import os, sys, tempfile, subprocess
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); parts = root / 'sources.list.d'; parts.mkdir()
            original = 'deb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n'
            (parts / 'microsoft.list').write_text(original)
            (root / 'sources.list').write_text('deb http://archive.ubuntu.com/ubuntu noble main\n')
            snapshots = []
            def remap(value):
                return root / str(value).removeprefix('/etc/apt/') if str(value).startswith('/etc/apt/') else Path(value)
            def fail(command, env, check):
                self.assertEqual(command, ['/node','/cli','install-deps','chromium'])
                self.assertTrue(check)
                config = Path(env['APT_CONFIG']); snapshots.append(config.parent)
                self.assertEqual((config.parent / 'sources.list.d/microsoft.list').read_text(), '')
                self.assertEqual((parts / 'microsoft.list').read_text(), original)
                raise subprocess.CalledProcessError(100, command)
            with patch.object(deps,'Path',side_effect=remap), patch.object(os,'geteuid',return_value=0), patch.object(sys,'argv',['installer','/node','/cli']), patch.dict(os.environ,{},clear=True), patch.object(deps.subprocess,'run',side_effect=fail):
                with self.assertRaises(subprocess.CalledProcessError): deps.main()
            self.assertEqual((parts / 'microsoft.list').read_text(),original)
            self.assertTrue(snapshots)
            self.assertTrue(all(not p.exists() for p in snapshots))
    def test_no_signature_bypass(self):
        source = Path(deps.__file__).read_text()
        self.assertNotIn('AllowUnauthenticated',source)
        self.assertNotIn('AllowInsecureRepositories',source)

if __name__ == '__main__': unittest.main()
