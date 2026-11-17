#!/usr/bin/env python3
"""Offline guards against fictionalizing the actual film source; no inference."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('launch',ROOT/'scripts/render-launch.py')
launch=importlib.util.module_from_spec(spec);spec.loader.exec_module(launch)

class ActualEvidenceGuard(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='decapod-film-guard-')
        self.directory=Path(self.temp.name)/'evidence'
        shutil.copytree(ROOT/'evidence/pi-1758-20261117-01',self.directory)
    def tearDown(self):self.temp.cleanup()
    def change(self,name,edit):
        p=self.directory/name;value=json.loads(p.read_text());edit(value);p.write_text(json.dumps(value))
    def rejected(self):
        with self.assertRaises(ValueError):launch.evidence(self.directory)
    def test_actual_reviewed_run_is_usable(self):
        manifest,_=launch.evidence(self.directory)
        self.assertTrue(manifest['observed_autonomous_admission'])
        self.assertFalse(manifest['current_admission_applicable'])
    def test_different_head_cannot_borrow_the_story(self):
        self.change('manifest.json',lambda m:m['admission_observed'].update(head='0'*40));self.rejected()
    def test_historical_proof_cannot_become_present_authority(self):
        self.change('manifest.json',lambda m:m.update(current_admission_applicable=True,merge_authorized=True));self.rejected()
    def test_changed_witness_bytes_are_rejected(self):
        p=self.directory/'kernel.json';p.write_text(p.read_text()+' ');self.rejected()
    def test_failed_controls_cannot_be_relabelled_success(self):
        self.change('controls.json',lambda c:c['target_advancement'].update(exit_code=0));self.rejected()
    def test_witness_path_escape_is_rejected(self):
        self.change('capture.json',lambda c:c['artifacts']['host'].update(file='../host.json'));self.rejected()
    def test_missing_failure_cannot_be_edited_into_a_real_arc(self):
        self.change('manifest.json',lambda m:m.update(events=[e for e in m['events'] if e['kind']!='required_check_failed']));self.rejected()

if __name__=='__main__':unittest.main()
