#!/usr/bin/env python3
"""Verify actual encoded media separately from the source-event projection."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
def sha(p):return 'sha256:'+hashlib.sha256(p.read_bytes()).hexdigest()
def seconds(s):
 h,m,t=s.split(':');return int(h)*3600+int(m)*60+float(t)
def verify(assets):
 report=json.loads((assets/'decapod-launch-render.json').read_text())
 assert {o['variant'] for o in report['outputs']}=={'main','social','mobile'}
 actual=[]
 for output in report['outputs']:
  v=output['variant'];stem='decapod-launch'+('' if v=='main' else '-'+v)
  p=assets/(stem+'.mp4');captions=assets/(stem+'.vtt')
  assert sha(p)==output['video_sha256'] and sha(captions)==output['captions_sha256']
  assert 100_000<p.stat().st_size<18*1024*1024
  meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(p)]))
  video=next(s for s in meta['streams'] if s['codec_type']=='video')
  audio=next(s for s in meta['streams'] if s['codec_type']=='audio')
  expected=(1080,1920,56) if v=='mobile' else ((1280,720,12) if v=='social' else (1920,1080,56))
  assert (video['width'],video['height'],round(float(meta['format']['duration'])))==expected
  assert video['codec_name']=='h264' and video['pix_fmt']=='yuv420p'
  assert audio['codec_name']=='aac' and audio['channels']==2 and audio['sample_rate']=='48000'
  track = subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-c:a','copy','-f','hash','-'], text=True)
  assert 'sha256:'+track.strip().removeprefix('SHA256=') == output['original_audio_sha256']
  assert abs(float(meta['format']['duration'])-expected[2])<.1
  # Inspect MP4 container ordering for browser startup without downloading mdat.
  atoms=[]
  with p.open('rb') as f:
   while f.tell()<p.stat().st_size:
    header=f.read(8);size,name=struct.unpack('>I4s',header)
    if size==1:size=struct.unpack('>Q',f.read(8))[0];extra=16
    else:extra=8
    assert size>=extra
    atoms.append(name);f.seek(size-extra,1)
  assert atoms.index(b'moov')<atoms.index(b'mdat')
  cues=re.findall(r'(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})\n([^\n]+)',captions.read_text())
  assert captions.read_text().startswith('WEBVTT\n') and len(cues)==len(output['scenes'])
  previous=0
  for (begin,end,text),scene in zip(cues,output['scenes']):
   assert seconds(begin)==previous and seconds(end)>previous
   assert seconds(begin)==scene['start'] and seconds(end)==scene['end']
   assert text==' '.join(scene['editorial']['title'])+' '+scene['editorial']['detail']
   previous=seconds(end)
  assert previous==expected[2]
  subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],check=True)
  pcm=subprocess.check_output(['ffmpeg','-v','error','-ss','2','-t','3','-i',str(p),'-vn','-f','f32le','-'])
  samples=np.frombuffer(pcm,dtype='<f4');rms=float(np.sqrt(np.mean(samples*samples)))
  assert .002<rms<.5 and np.max(np.abs(samples))<.99
  actual.append(dict(variant=v,bytes=p.stat().st_size,width=video['width'],height=video['height'],duration=float(meta['format']['duration']),audio_rms=rms,caption_cues=len(cues)))
 with Image.open(assets/'decapod-launch-poster.png') as im:
  assert im.size==(1920,1080) and im.mode=='RGB'
  assert len(im.resize((100,100)).getcolors(10000))>50
 proof = verify_proof_video(assets)
 print(json.dumps({'scope':'actual_encoded_media','outputs':actual,'proof_outputs':proof,'poster_verified':True,'deployment_verified':False},indent=2))

def verify_proof_video(assets):
 report = json.loads((assets/'decapod-proof-render.json').read_text())
 assert report['schema'] == 'decapod.pi-tui-release.v1'
 output = report['output']
 assert output['file'] == 'decapod-proof.mp4'
 captions = assets/'decapod-proof.vtt'
 poster = assets/'decapod-proof-poster.png'
 assert sha(captions) == report['captions_sha256'] and sha(poster) == report['poster_sha256']
 with Image.open(poster) as image:
  assert image.size == (1440, 924) and image.mode == 'RGB'
 cues = re.findall(r'(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})', captions.read_text())
 assert captions.read_text().startswith('WEBVTT\n') and len(cues) >= 5
 previous = 0
 for begin, end in cues:
  assert seconds(begin) >= previous and seconds(end) > seconds(begin)
  previous = seconds(end)
 path = assets/output['file']
 assert sha(path) == output['sha256'] and 100_000 < path.stat().st_size < 80*1024*1024
 meta = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
 video, = meta['streams']
 assert video['codec_type'] == 'video' and video['codec_name'] == 'h264' and video['pix_fmt'] == 'yuv420p'
 assert (video['width'], video['height']) == (1440, 924) == (output['width'], output['height'])
 duration = float(meta['format']['duration'])
 assert abs(duration * 1000 - output['duration_ms']) < 100 and duration >= previous
 subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True)
 return [output]

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--assets',type=Path,default=ROOT/'assets');verify(p.parse_args().assets)
