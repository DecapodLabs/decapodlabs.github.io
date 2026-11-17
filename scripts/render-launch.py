#!/usr/bin/env python3
"""Website-owned film over verified real-agent evidence; never a proof producer.

python scripts/render-launch.py --evidence evidence/pi-1758-20261117-01
Requires the existing showcase renderer's Python dependencies and FFmpeg.
All screen language is editorial, with exact observed facts drawn from the
kernel's read-only manifest. No terminal, agent thought or validation is simulated.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
os.environ['DECAPOD_SHOWCASE_FONTS'] = str(ROOT / 'assets/fonts')
spec = importlib.util.spec_from_file_location('showcase', ROOT / 'scripts/render-showcase.py')
brand = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brand)
IVORY, INK, CORAL = (249, 246, 238), brand.INK, brand.CORAL
MUTED, GREEN = (105, 108, 103), (43, 105, 80)
FPS = 30


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def evidence(directory):
    """Reject invented success, altered witnesses, missing causal events or controls."""
    manifest = json.loads((directory / 'manifest.json').read_text())
    capture = json.loads((directory / 'capture.json').read_text())
    if manifest['schema'] != 'decapod.agent-acceptance.v1' or not manifest['observed_autonomous_admission']:
        raise ValueError('a real independently correlated autonomous admission is required')
    if manifest['publication_ready'] or manifest['merge_authorized'] or manifest['human_interventions']:
        raise ValueError('presentation must never grant authority or conceal intervention')
    for artifact in capture['artifacts'].values():
        name = artifact['file']
        if Path(name).name != name or (directory / name).is_symlink():
            raise ValueError('unsafe witness path')
        if digest((directory / name).read_bytes()) != artifact['sha256']:
            raise ValueError('witness digest mismatch')
    kinds = {e['kind'] for e in manifest['events']}
    required = {'objective_received', 'context_consulted', 'task_claimed', 'workspace_bound',
                'required_check_failed', 'agent_changed_failed_source', 'fresh_validation_observed',
                'publication_observed', 'pr_admission_independently_correlated'}
    if not required <= kinds:
        raise ValueError('incomplete observed lifecycle')
    indexed = {e['sequence']: e for e in capture['events']}
    for event in manifest['events']:
        original = indexed[event['sequence']]
        artifact = capture['artifacts'][original['artifact']]
        expected = digest(f"{capture['run_id']}:{event['sequence']}:{artifact['sha256']}:{original['pointer']}".encode())
        if expected != event['id'] or event['evidence']['sha256'] != artifact['sha256']:
            raise ValueError('manifest event binding mismatch')
        source = json.loads((directory / artifact['file']).read_text())[int(original['pointer'].removeprefix('/'))]
        facts = event['facts']
        if event['kind'] == 'fresh_validation_observed':
            actual = source['observations']['before']
            if facts != dict(head=actual['head_revision'], base=actual['accepted_base_revision'],
                             receipt_hash=source['receipt']['receipt_hash'], scope=source['receipt']['scope'],
                             checks=len(source['observations']['results'])):
                raise ValueError('editorial proof facts differ from the kernel witness')
        if event['kind'] == 'pr_admission_independently_correlated':
            if facts != {k:source[k] for k in ['head','base','merged']} | {'pr_url':source['url']}:
                raise ValueError('editorial admission facts differ from GitHub readback')
    controls = json.loads((directory / 'controls.json').read_text())
    for name in ['source_mutation', 'target_advancement']:
        control = controls[name]
        if control['exit_code'] == 0 or not control['reason_codes'] or not control['evidence_sha256'].startswith('sha256:'):
            raise ValueError('negative controls must preserve actual kernel rejection')
    return manifest, controls


def scenes(m, controls, social=False):
    admission = m['admission_observed']
    fresh = [e for e in m['events'] if e['kind'] == 'fresh_validation_observed'][-1]
    fail = next(e for e in m['events'] if e['kind'] == 'required_check_failed')
    source = [e['id'] for e in m['events'] if e['kind'] == 'agent_changed_failed_source']
    result = [
        dict(duration=6, act='01 / INTENT', title=['Give your agent', 'an objective.'], accent=1,
             detail=m['objective']['text'], tag='ONE HUMAN OBJECTIVE', evidence=[m['events'][0]['id']]),
        dict(duration=6, act='02 / AUTONOMY', title=['Walk away.'], accent=0,
             detail='The agent discovers Decapod, claims its task and enters an isolated workspace.',
             tag='PI · REAL MODEL · REAL TOOLS', evidence=[e['id'] for e in m['events'] if e['kind'] in ['context_consulted','task_claimed','workspace_bound']]),
        dict(duration=8, act='03 / REJECTION', title=['Progress is', 'not proof.'], accent=1,
             detail='Required authorization check failed. A member without a repository grant was allowed access.',
             tag='EXPECTED FALSE / OBSERVED TRUE', status='REJECTED', evidence=[fail['id']]),
        dict(duration=9, act='04 / CORRECTION', title=['Feedback becomes', 'a better decision.'], accent=1,
             detail='The agent reads the failure and repairs repository-scoped access. No human supplies the fix.',
             tag='INVESTIGATE → REPAIR → REVALIDATE', evidence=source),
        dict(duration=9, act='05 / PROOF', title=['Come back', 'to receipts.'], accent=1,
             detail='10 access assertions. Independent source guard. Fresh execution, bound to the exact work.',
             tag='HEAD ' + admission['head'][:12], status='CHECKS PASSED',
             receipt=fresh['facts']['receipt_hash'], evidence=[fresh['id']]),
        dict(duration=8, act='06 / ADMISSION', title=['A real PR.', 'Verified by Decapod.'], accent=1,
             detail=f"PR #{admission['pr_url'].rsplit('/',1)[1]} · exact head and accepted base independently read back on GitHub.",
             tag='BASE ' + admission['base'][:12], status='ADMITTED · NOT MERGE AUTHORIZED',
             evidence=[e['id'] for e in m['events'] if e['kind']=='pr_admission_independently_correlated']),
        dict(duration=5, act='07 / STILL BOUND', title=['Change the work.', 'Invalidate the proof.'], accent=1,
             detail='Source mutation and target advancement reject historical authorization. Admission never authorizes merge.',
             tag='HISTORICAL SUCCESS ≠ PRESENT AUTHORITY', evidence=[controls['source_mutation']['evidence_sha256'],controls['target_advancement']['evidence_sha256']]),
        dict(duration=5, act='DECAPOD LABS', title=['DECAPOD'], accent=0,
             detail='HARNESS AI METACOGNITION.', tag='decapodlabs.github.io', outro=True, evidence=[]),
    ]
    if social:
        result = [dict(result[0], duration=3), dict(result[2], duration=3),
                  dict(result[4], duration=3), dict(result[-1], duration=3)]
    return result


def wrapped(draw, text, font, width):
    lines, current = [], ''
    for word in text.split():
        candidate = (current + ' ' + word).strip()
        if current and draw.textlength(candidate, font=font) > width:
            lines.append(current); current = word
        else:
            current = candidate
    return lines + ([current] if current else [])


def frame(scene, local, width, height, absolute):
    mobile = height > width
    # Render in design coordinates, then resample only for the social export.
    w, h = (1080, 1920) if mobile else (1920, 1080)
    image = Image.new('RGB', (w, h), INK if scene.get('outro') else IVORY)
    d = ImageDraw.Draw(image)
    fg = IVORY if scene.get('outro') else INK
    x, content_width = (82, 916) if mobile else (136, 1250)
    reveal = brand.ease(min(local / .8, 1)); offset = round(32 * (1 - reveal))
    heavy = lambda s: brand.font(brand.FONT_HEAVY, s)
    reg = lambda s: brand.font(brand.FONT_REG, s)
    small = reg(25 if mobile else 23)
    # Quiet orbit and measured progress connect the evidence to the governance kernel.
    cx, cy = (815, 1450) if mobile else (1580, 620)
    radius = 250 if mobile else 270
    orbit = (221, 217, 207) if not scene.get('outro') else (52, 56, 56)
    for r in [radius, radius + 65]:d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=orbit,width=2)
    angle = absolute * .35
    px,py=cx+radius*math.cos(angle),cy+radius*math.sin(angle)
    d.ellipse((px-7,py-7,px+7,py+7),fill=CORAL)
    d.text((x, 88 if not mobile else 112), scene['act'],font=small,fill=CORAL)
    title_size = (112 if mobile else 118) if not scene.get('outro') else (150 if mobile else 174)
    title_y = (295 if mobile else 245) + offset
    for i,line in enumerate(scene['title']):
        f=heavy(title_size)
        while d.textlength(line,font=f)>content_width:
            title_size-=2;f=heavy(title_size)
        d.text((x,title_y+i*(title_size+16)),line,font=f,fill=CORAL if i==scene.get('accent') else fg)
    body_y = (680 if mobile else 605) + offset
    body_size = 38 if mobile else 34
    for i,line in enumerate(wrapped(d,scene['detail'],reg(body_size), 885 if mobile else 1120)):
        d.text((x,body_y+i*54),line,font=reg(body_size),fill=fg if scene.get('outro') else MUTED)
    badge_y = 1050 if mobile else 795
    if scene.get('status'):
        status=scene['status'];f=heavy(24 if mobile else 23)
        bw=d.textlength(status,font=f)+42
        color=CORAL if status=='REJECTED' else GREEN
        d.rounded_rectangle((x,badge_y,x+bw,badge_y+58),radius=8,fill=color)
        d.text((x+21,badge_y+13),status,font=f,fill=IVORY)
    d.text((x,1148 if mobile else 890),scene['tag'],font=small,fill=CORAL if scene.get('outro') else MUTED)
    if scene.get('receipt'):
        d.text((x,1210 if mobile else 939),'RECEIPT '+scene['receipt'].removeprefix('sha256:')[:24],font=reg(21),fill=MUTED)
    scale=.48 if mobile else .43
    sprite=brand.crab_sprite(round(absolute*FPS),scale,math.sin(absolute*.7)*3)
    sx,sy=(cx-sprite.width//2,cy-sprite.height//2)
    image.paste(sprite,(sx,sy),sprite)
    if not scene.get('outro'):
        label='REAL AGENT RUN / EDITED FROM OBSERVED EVENTS'
        d.text((x,h-70),label,font=reg(18 if mobile else 19),fill=MUTED)
    # Subtle scene entrance, no flashing or invented terminal output.
    if local < .25:
        veil=Image.new('RGB',(w,h),INK if scene.get('outro') else IVORY)
        image=Image.blend(veil,image,min(1,local/.25))
    return image if (w,h)==(width,height) else image.resize((width,height),Image.Resampling.LANCZOS)


def soundtrack(path, duration):
    """Original restrained score; no samples or third-party music."""
    rate=48000;t=np.arange(round(duration*rate),dtype=np.float64)/rate
    score=np.zeros_like(t)
    for i,at in enumerate(np.arange(0,duration,2)):
        freq=[130.8128,155.5635,174.6141,195.9977,261.6256,233.0819,195.9977][i%7]
        u=t-at;mask=(u>=0)&(u<3.8);z=u[mask]
        env=(1-np.exp(-z*4))*np.exp(-z*1.25)
        score[mask]+=env*(np.sin(2*np.pi*freq*z)*.08+np.sin(2*np.pi*freq*2*z)*.025)
    score*=np.minimum(1,t/1.5)*np.minimum(1,(duration-t)/2)
    stereo=np.column_stack((score,score*.96))
    with wave.open(str(path),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(rate)
        out.writeframes((np.clip(stereo,-1,1)*32767).astype('<i2').tobytes())


def stamp(seconds):
    ms=round(seconds*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'


def render(m, controls, output, variant):
    social=variant=='social';mobile=variant=='mobile'
    width,height=(1080,1920) if mobile else ((1280,720) if social else (1920,1080))
    timeline=scenes(m,controls,social);duration=sum(s['duration'] for s in timeline)
    target=output/('decapod-launch'+('' if variant=='main' else '-'+variant))
    cues=['WEBVTT',''];now=0;edit=[]
    for s in timeline:
        cues.extend([f'{stamp(now)} --> {stamp(now+s["duration"])}',' '.join(s['title'])+' '+s['detail'],''])
        edit.append({'start':now,'end':now+s['duration'],'editorial':s,'observed_event_ids_or_control_digests':s['evidence']});now+=s['duration']
    target.with_suffix('.vtt').write_text('\n'.join(cues)+'\n')
    with tempfile.TemporaryDirectory(prefix='decapod-launch-') as tmp:
        audio=Path(tmp)/'original-score.wav';soundtrack(audio,duration)
        command=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(FPS),'-i','pipe:0','-i',str(audio),'-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-t',str(duration),str(target.with_suffix('.mp4'))]
        proc=subprocess.Popen(command,stdin=subprocess.PIPE)
        try:
            n=0;absolute=0
            for s in timeline:
                for i in range(round(s['duration']*FPS)):
                    image=frame(s,i/FPS,width,height,absolute)
                    proc.stdin.write(image.tobytes());n+=1;absolute=n/FPS
            proc.stdin.close()
            if proc.wait()!=0:raise RuntimeError('FFmpeg failed')
        except BaseException:
            proc.stdin.close();proc.terminate();proc.wait();raise
    if variant=='main':
        frame(timeline[4],1,1920,1080,31).save(output/'decapod-launch-poster.png',optimize=True)
    return {'variant':variant,'width':width,'height':height,'duration':duration,'fps':FPS,'scenes':edit,
            'video_sha256':digest(target.with_suffix('.mp4').read_bytes()),'captions_sha256':digest(target.with_suffix('.vtt').read_bytes())}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'assets')
    parser.add_argument('--variant',choices=['all','main','social','mobile'],default='all')
    args=parser.parse_args();m,c=evidence(args.evidence);args.output.mkdir(parents=True,exist_ok=True)
    variants=['main','social','mobile'] if args.variant=='all' else [args.variant]
    outputs=[render(m,c,args.output,v) for v in variants]
    report={'schema':'decapod.launch-render.v1','run_id':m['run_id'],'manifest_sha256':digest((args.evidence/'manifest.json').read_bytes()),
            'audio':'Original synthesized score by Decapod Labs; no external samples',
            'claim_scope':'Edited real-agent events; historical PR admission, never merge authorization. Controlled post-run probes are distinct from agent actions.',
            'outputs':outputs}
    (args.output/'decapod-launch-render.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'outputs':[{'variant':r['variant'],'duration':r['duration']} for r in outputs]}))


if __name__=='__main__':main()
