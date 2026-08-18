from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("FFMPEG_BIN", "ffmpeg")
os.environ.setdefault("FFPROBE_BIN", "ffprobe")
sys.path.insert(0, str(Path(__file__).parents[1] / "server" / "fallback-worker" / "container"))

from processor import PDF_LIMITS, VIDEO_LIMITS, JobFailure, compress_video, optimize_pdf  # noqa: E402


ROOT = Path(__file__).parents[1]
PDF_FIXTURES = [
    ROOT / "tests/fixtures/compress-text-heavy.pdf",
    ROOT / "tests/fixtures/compress-image-heavy.pdf",
    ROOT / "tests/fixtures/compress-mixed-content.pdf",
    ROOT / "tests/fixtures/compress-already-optimized.pdf",
]
VIDEO_FIXTURES = [
    ROOT / "tests/fixtures/video/mp4-h264-aac.mp4",
    ROOT / "tests/fixtures/video/mp4-h264-no-audio.mp4",
    ROOT / "tests/fixtures/video/mov-h264-aac.mov",
]


def no_progress(_value: float) -> None:
    pass


def run_pdf(path: Path, directory: Path) -> dict[str, object]:
    output = directory / f"{path.stem}.compressed.pdf"
    try:
        result = optimize_pdf(path, output, "balanced", PDF_LIMITS, no_progress)
        return {"file": path.name, "status": "compressed", **result}
    except JobFailure as error:
        return {"file": path.name, "status": "deferred", "code": error.code, "inputBytes": path.stat().st_size}


def run_video(path: Path, directory: Path) -> dict[str, object]:
    output = directory / f"{path.stem}.compressed.webm"
    try:
        result = compress_video(path, output, "balanced", VIDEO_LIMITS, no_progress)
        return {"file": path.name, "status": "compressed", **result}
    except JobFailure as error:
        return {"file": path.name, "status": "deferred", "code": error.code, "inputBytes": path.stat().st_size}


with tempfile.TemporaryDirectory(prefix="domyfile-benchmark-") as temporary_directory:
    directory = Path(temporary_directory)
    print(json.dumps({"pdf": [run_pdf(path, directory) for path in PDF_FIXTURES], "video": [run_video(path, directory) for path in VIDEO_FIXTURES]}, indent=2))
