import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import yaml
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('acceptance', Path(__file__).resolve().parents[1] / 'scripts/browser_acceptance.py')
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)

class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); (self.root/'scripts').mkdir()
        (self.root/'frontend/build').mkdir(parents=True)
        (self.root/'frontend/build/rmc-release.json').write_text('{}')
        for name, _ in a.STAGES: (self.root/'scripts'/name).write_text(name)
        self.path = self.root/'receipt.json'
        self.env = dict(RMC_BROWSER_ACCEPTANCE=str(self.path), RMC_CAPTURE_CANDIDATE='a'*40,
                        GITHUB_RUN_ID='123', GITHUB_RUN_ATTEMPT='2')
    def complete(self):
        receipt = a.Acceptance(self.root, self.env)
        with patch.object(a.subprocess,'run') as run:
            for name, timeout in a.STAGES: receipt.run(name,timeout)
            self.assertEqual(run.call_count,8)
            self.assertTrue(all(c.kwargs['check'] for c in run.call_args_list))
        return receipt
    def test_complete_round_trip(self):
        data = self.complete().finish()
        a.validate(json.loads(self.path.read_text()),self.root,self.env)
        self.assertEqual(len(data['stages']),8)
    def test_ci_requires_receipt_and_identity_before_execution(self):
        for key in ('RMC_BROWSER_ACCEPTANCE', 'RMC_CAPTURE_CANDIDATE',
                    'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'):
            for value in (None, ''):
                env = dict(self.env, GITHUB_ACTIONS='true')
                if value is None: del env[key]
                else: env[key] = value
                with self.subTest(key=key, value=value), patch.object(a.subprocess, 'run') as run:
                    with self.assertRaisesRegex(ValueError, key): a.Acceptance(self.root, env)
                    run.assert_not_called()
    def test_local_execution_can_omit_receipt_file(self):
        env = dict(self.env); del env['RMC_BROWSER_ACCEPTANCE']
        receipt = a.Acceptance(self.root, env)
        with patch.object(a.subprocess, 'run'):
            for stage in a.STAGES: receipt.run(*stage)
        a.validate(receipt.finish(), self.root, env)
        self.assertFalse(self.path.exists())
    def test_workflow_producer_and_packager_share_receipt_path(self):
        workflow = Path(__file__).resolve().parents[1] / '.github/workflows/pr-validation.yml'
        steps = yaml.safe_load(workflow.read_text())['jobs']['validate']['steps']
        producers = [s for s in steps if 'python scripts/run_table_browser_test.py' in s.get('run', '')]
        consumers = [s for s in steps if 'python scripts/browser_acceptance.py' in s.get('run', '')]
        self.assertEqual(len(producers), 1); self.assertEqual(len(consumers), 1)
        for key in ('RMC_BROWSER_ACCEPTANCE', 'RMC_CAPTURE_CANDIDATE'):
            self.assertTrue(producers[0].get('env', {}).get(key), key)
            self.assertEqual(producers[0]['env'][key], consumers[0]['env'][key])
        self.assertEqual(producers[0]['env']['RMC_BROWSER_ACCEPTANCE'],
                         '${{ runner.temp }}/rmc-browser-acceptance.json')
    def test_missing_stage_has_no_receipt(self):
        receipt = a.Acceptance(self.root,self.env)
        with patch.object(a.subprocess,'run'):
            for stage in a.STAGES[:-1]: receipt.run(*stage)
        with self.assertRaises(ValueError): receipt.finish()
        self.assertFalse(self.path.exists())
    def test_duplicate_stage_rejected_before_execution(self):
        receipt = a.Acceptance(self.root,self.env)
        with patch.object(a.subprocess,'run') as run:
            receipt.run(*a.STAGES[0])
            with self.assertRaises(ValueError): receipt.run(*a.STAGES[0])
            self.assertEqual(run.call_count,1)
        with self.assertRaises(ValueError): receipt.finish()
    def test_failure_removes_stale_receipt_and_cannot_finish(self):
        self.path.write_text('old acceptance')
        receipt = a.Acceptance(self.root,self.env)
        self.assertFalse(self.path.exists())
        with patch.object(a.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['node'])):
            with self.assertRaises(subprocess.CalledProcessError): receipt.run(*a.STAGES[0])
        with self.assertRaises(ValueError): receipt.finish()
        self.assertFalse(self.path.exists())
    def test_timeout_cannot_finish(self):
        receipt = a.Acceptance(self.root,self.env)
        with patch.object(a.subprocess,'run',side_effect=subprocess.TimeoutExpired(['node'],150)):
            with self.assertRaises(subprocess.TimeoutExpired): receipt.run(*a.STAGES[0])
        with self.assertRaises(ValueError): receipt.finish()
    def test_wrong_candidate_attempt_or_manifest_rejected(self):
        data = self.complete().finish()
        for key in ('candidate_commit','run_id','run_attempt','web_manifest_sha256'):
            changed = copy.deepcopy(data); changed[key] = 'stale'
            with self.subTest(key=key), self.assertRaises(ValueError): a.validate(changed,self.root,self.env)
    def test_modified_scripts_or_manifest_after_execution_rejected(self):
        for path in (self.root/'scripts'/a.STAGES[0][0],self.root/'frontend/build/rmc-release.json'):
            receipt = self.complete(); path.write_text(path.read_text()+'changed')
            with self.assertRaises(ValueError): receipt.finish()
            self.assertFalse(self.path.exists())
    def test_failed_duplicate_or_untrusted_receipt_rejected(self):
        data = self.complete().finish()
        for mutate in (lambda d:d['stages'].pop(),lambda d:d['stages'].append(d['stages'][0]),
                       lambda d:d['stages'][0].update(exit_code=1),lambda d:d.update(signed_device_validation=True)):
            changed = copy.deepcopy(data); mutate(changed)
            with self.assertRaises(ValueError): a.validate(changed,self.root,self.env)

if __name__ == '__main__': unittest.main()

