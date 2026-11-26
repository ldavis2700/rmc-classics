import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
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
