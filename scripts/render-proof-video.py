#!/usr/bin/env python3
"""Render the reviewed, timestamped terminal excerpts captured during Pi execution."""
import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FPS = 15
INK = "#141719"
PANEL = "#202525"
WHITE = "#f9f6ee"
MUTED = "#bdc7c4"
CORAL = "#ff886e"
GREEN = "#9cd8bc"


def sha(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


@lru_cache(maxsize=16)
def font(size, bold=False):
    weight = "Heavy" if bold else "Regular"
    return ImageFont.truetype(ROOT / "assets/fonts" / f"Lato-{weight}.ttf", size)


def stamp(ms):
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02}.{ms % 1000:03}"


def wrap(text, draw, face, width):
    if not text:
        return [""]
    lines = []
    remaining = text
    while draw.textlength(remaining, font=face) > width:
        cut = len(remaining)
        while draw.textlength(remaining[:cut], font=face) > width:
            cut -= 1
        space = remaining.rfind(" ", 0, cut + 1)
        if space > cut // 2:
            cut = space
        lines.append(remaining[:cut])
        remaining = remaining[cut:].lstrip()
    return lines + [remaining]


def reviewed_recording(path):
    data = path.read_bytes()
    production = json.loads((ROOT / "media/launch-production.json").read_text())
    if sha(data) != production["approved_terminal_excerpts_sha256"]:
        raise ValueError("unreviewed terminal excerpts")
    record = json.loads(data)
    if record["schema"] != "decapod.pi-terminal-excerpts.v1":
        raise ValueError("unsupported terminal excerpt format")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", record["terminal_capture_sha256"]):
        raise ValueError("missing original terminal capture identity")
    offsets = [clip["elapsed_ms"] for clip in record["clips"]]
    if offsets != sorted(offsets):
        raise ValueError("terminal excerpts out of observed order")
    for clip in record["clips"]:
        if not clip["lines"] or not 4 <= clip["seconds"] <= 20:
            raise ValueError("invalid terminal excerpt")
        if any(re.search(r"[\x00-\x1f\x7f]", line) for line in clip["lines"]):
            raise ValueError("control character in public terminal excerpt")
    return record


def frame(record, clip, index, width, height, show_result=True):
    mobile = height > width
    image = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(image)
    margin = 70 if not mobile else 48
    draw.text((margin, 42), "PI EXECUTION • PROOF RECORDING", font=font(30, True), fill=CORAL)
    draw.text((margin, 87),
              f"Pi {record['pi_version']}  /  Decapod {record['kernel_version']}  /  {record['model']}",
              font=font(25), fill=MUTED)
    draw.rounded_rectangle((margin, 145, width-margin, height-106), 24, fill=PANEL)
    x = margin + 30
    draw.text((x, 176), f"{stamp(clip['elapsed_ms'])}   {clip['label']}", font=font(29, True), fill=GREEN)
    available = width-2*x
    body_size = 39 if mobile else 40
    body = font(body_size)
    lines = [line for raw in clip["lines"] for line in wrap(raw, draw, body, available)]
    while 241 + (body_size + 16) * len(lines) > height - 156 and body_size > 28:
        body_size -= 1
        body = font(body_size)
        lines = [line for raw in clip["lines"] for line in wrap(raw, draw, body, available)]
    if 241 + (body_size + 16) * len(lines) > height - 156:
        raise ValueError("terminal excerpt needs a shorter selection")
    if not show_result:
        first = clip["lines"][:clip["command_line_count"]]
        lines = [line for raw in first for line in wrap(raw, draw, body, available)]
    for row, line in enumerate(lines):
        draw.text((x, 241 + row*(body_size+16)), line, font=body, fill=WHITE)
    label = f"{index + 1}/{len(record['clips'])}   Actual terminal excerpts · Waits shortened"
    draw.text((margin, height-78), label, font=font(24), fill=MUTED)
    return image


def render(record, output, suffix, width, height):
    stem = output / f"decapod-proof{suffix}"
    total_ms = 0
    cues = ["WEBVTT", ""]
    with tempfile.TemporaryDirectory(prefix="decapod-terminal-proof-") as temp:
        directory = Path(temp)
        concat = directory / "frames.ffconcat"
        entries = ["ffconcat version 1.0"]
        for index, clip in enumerate(record["clips"]):
            seconds = clip["seconds"]
            if clip.get("command_line_count"):
                command = directory / f"{index:02}-command.png"
                frame(record, clip, index, width, height, show_result=False).save(command)
                lead = min(2, seconds / 3)
                entries.extend([f"file {command.name}", f"duration {lead}"])
                seconds -= lead
            png = directory / f"{index:02}.png"
            frame(record, clip, index, width, height).save(png)
            entries.extend([f"file {png.name}", f"duration {seconds}"])
            end_ms = total_ms + clip["seconds"] * 1000
            cues.extend([f"{stamp(total_ms)} --> {stamp(end_ms)}",
                         clip["caption"], ""])
            total_ms = end_ms
        entries.append(f"file {png.name}")
        concat.write_text("\n".join(entries) + "\n")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-f", "concat", "-i", str(concat), "-r", str(FPS),
                        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
                        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                        "-t", str(total_ms / 1000), str(stem.with_suffix(".mp4"))], check=True)
    if not suffix:
        frame(record, record["clips"][0], 0, width, height).save(
            output / "decapod-proof-poster.png", optimize=True)
        stem.with_suffix(".vtt").write_text("\n".join(cues).rstrip() + "\n")
    return {"file": stem.with_suffix(".mp4").name, "width": width, "height": height,
            "duration_ms": total_ms, "sha256": sha(stem.with_suffix(".mp4").read_bytes())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recording", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "assets")
    args = parser.parse_args()
    production = json.loads((ROOT / "media/launch-production.json").read_text())
    recording = args.recording or ROOT / production["recorded_evidence_directory"] / "terminal-excerpts.json"
    record = reviewed_recording(recording)
    args.output.mkdir(parents=True, exist_ok=True)
    outputs = [render(record, args.output, "", 1920, 1080),
               render(record, args.output, "-mobile", 1080, 1440)]
    report = {"schema": "decapod.pi-proof-render.v1", "run_id": record["run_id"],
              "terminal_excerpts_sha256": sha(recording.read_bytes()),
              "outputs": outputs,
              "captions_sha256": sha((args.output / "decapod-proof.vtt").read_bytes()),
              "poster_sha256": sha((args.output / "decapod-proof-poster.png").read_bytes())}
    (args.output / "decapod-proof-render.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
