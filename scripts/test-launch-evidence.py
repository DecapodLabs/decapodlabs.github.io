#!/usr/bin/env python3
"""Offline guards against fictionalizing the actual film source; no inference."""
import importlib.util
import json
import os
import subprocess
import textwrap
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
    def test_controller_selected_prompt_cannot_claim_direct_human_authorship(self):
        self.change('objective-provenance.json',lambda p:p.update(selected_by='human',direct_human_authorship_attested=True));self.rejected()
    def test_changed_human_mission_is_rejected(self):
        p=self.directory/'human-mission.txt';p.write_text(p.read_text()+' changed');self.rejected()
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

class MediaInputGuard(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='decapod-media-inputs-')
        self.root=Path(self.temp.name)
        self.env=os.environ.copy()
        self.env.update(GIT_AUTHOR_NAME='Media guard fixture', GIT_AUTHOR_EMAIL='fixture@example.invalid',
                        GIT_COMMITTER_NAME='Media guard fixture', GIT_COMMITTER_EMAIL='fixture@example.invalid',
                        GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull)
        self.git('init','--quiet')
        self.write('index.html','baseline')
        self.git('add','.')
        self.git('commit','--quiet','-m','baseline')
        self.before=self.git('rev-parse','HEAD').strip()
        workflow=(ROOT/'.github/workflows/site-bootstrap.yml').read_text()
        step=workflow.split('      - name: Select media generation from changed inputs\n',1)[1].split('\n      - name:',1)[0]
        self.script=textwrap.dedent(step.split('        run: |\n',1)[1])
    def tearDown(self):self.temp.cleanup()
    def git(self,*args):
        return subprocess.check_output(['git',*args],cwd=self.root,env=self.env,text=True)
    def write(self,path,value):
        p=self.root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(value)
    def selected(self,path,event='push',before=None):
        self.write(path,'changed')
        self.git('add','.')
        self.git('commit','--quiet','-m','change')
        output=self.root/'outputs'
        env=self.env|dict(EVENT_NAME=event,BEFORE_REVISION=self.before if before is None else before,
                          HEAD_REVISION=self.git('rev-parse','HEAD').strip(),GITHUB_OUTPUT=str(output))
        subprocess.run(['bash','-c',self.script],cwd=self.root,env=env,check=True,capture_output=True)
        return dict(line.split('=',1) for line in output.read_text().splitlines())
    def test_copy_only_preserves_all_committed_film_bytes(self):
        self.assertEqual(self.selected('index.html'),dict(teaser='false',launch='false'))
    def test_witness_change_regenerates_launch_only(self):
        self.assertEqual(self.selected('evidence/run/manifest.json'),dict(teaser='false',launch='true'))
    def test_shared_renderer_change_regenerates_both(self):
        self.assertEqual(self.selected('scripts/render-showcase.py'),dict(teaser='true',launch='true'))
    def test_missing_history_fails_safe_to_regeneration(self):
        self.assertEqual(self.selected('index.html',before='0'*40),dict(teaser='true',launch='true'))
    def test_manual_run_explicitly_regenerates_for_review(self):
        self.assertEqual(self.selected('index.html',event='workflow_dispatch'),dict(teaser='true',launch='true'))

if __name__=='__main__':unittest.main()
