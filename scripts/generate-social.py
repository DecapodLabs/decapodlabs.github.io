#!/usr/bin/env python3
"""Create the social card and favicon from the verified Decapod avatar."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
A = ROOT / "assets"
avatar = Image.open(A / "mascot-github-avatar.png").convert("RGBA")
assert avatar.size == (1024, 1024)
assert avatar.getchannel("A").getextrema() == (0, 255)
avatar.resize((128,128),Image.Resampling.LANCZOS).save(A/"favicon.png",optimize=True)

card=Image.new("RGB",(1200,630),(255,248,239))
draw=ImageDraw.Draw(card)
draw.rounded_rectangle((47,47,1153,583),radius=39,fill=(255,253,248),outline=(235,211,198),width=2)
bold="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
reg="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
def f(path,size):return ImageFont.truetype(path,size)
draw.text((105,104),"DECAPOD LABS",font=f(bold,36),fill=(27,19,26))
draw.rounded_rectangle((105,167,276,205),radius=18,fill=(255,229,211))
draw.text((123,172),"HARNESS AI",font=f(bold,17),fill=(228,77,48))
draw.text((100,260),"Your ideas.",font=f(bold,71),fill=(22,21,25))
draw.text((100,350),"Your agents.",font=f(bold,71),fill=(237,84,55))
draw.text((104,477),"METACOGNITION · PERSISTENT STATE · PROOF",font=f(bold,18),fill=(89,93,91))
small=avatar.resize((370,370),Image.Resampling.LANCZOS)
card.paste(small,(760,175),small)
card.save(A/"social-preview.png",optimize=True)
print("Favicon and Open Graph art generated from pinned mascot.")
