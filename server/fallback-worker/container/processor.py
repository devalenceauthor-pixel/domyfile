from __future__ import annotations

import http.client
import json
import math
import os
import signal
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import pikepdf
from pypdf import PdfReader


FFMPEG = os.environ.get("FFMPEG_BIN", "/opt/ffmpeg/bin/ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "/opt/ffmpeg/bin/ffprobe")
PORT = int(os.environ.get("PORT", "8080"))

PDF_LIMITS = {
    "max_upload_bytes": 50 * 1024 * 1024,
    "max_output_bytes": 60 * 1024 * 1024,
    "max_pages": 200,
    "max_decoded_pixels": 150_000_000,
    "max_memory_bytes": 1_536 * 1024 * 1024,
    "max_cpu_seconds": 60,
    "max_wall_seconds": 120,
    "minimum_savings_percent": 5,
}

VIDEO_LIMITS = {
    "max_upload_bytes": 256 * 1024 * 1024,
    "max_output_bytes": 256 * 1024 * 1024,
    "max_duration_seconds": 600,
    "max_decoded_pixels": 1920 * 1080,
    "max_width": 1920,
    "max_height": 1080,
    "max_memory_bytes": 3 * 1024 * 1024 * 1024,
    "max_cpu_seconds": 240,
    "max_wall_seconds": 300,
    "minimum_savings_percent": 5,
}

PDF_PRESETS = {"quality": 85, "balanced": 75, "smaller": 60}
VIDEO_PRESETS = {
    "quality": {"crf": 32, "audio_bitrate": "96k"},
    "balanced": {"crf": 38, "audio_bitrate": "64k"},
    "smaller": {"crf": 43, "audio_bitrate": "48k"},
}


class JobFailure(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def json_response(handler: BaseHTTPRequestHandler, value: dict[str, Any], status: int = 200) -> None:
    body = json.dumps(value, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0 or length > 64 * 1024:
        raise JobFailure("INVALID_INPUT")
    try:
        value = json.loads(handler.rfile.read(length))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise JobFailure("INVALID_INPUT") from None
    if not isinstance(value, dict):
        raise JobFailure("INVALID_INPUT")
    return value


def allowed_callback_url(value: Any) -> urllib.parse.ParseResult:
    if not isinstance(value, str):
        raise JobFailure("INVALID_INPUT")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or not parsed.path.startswith("/internal/jobs/"):
        raise JobFailure("INVALID_INPUT")
    return parsed


def same_gateway(*urls: urllib.parse.ParseResult) -> None:
    hosts = {url.netloc for url in urls}
    if len(hosts) != 1:
        raise JobFailure("INVALID_INPUT")


def download_input(url: str, token: str, destination: Path, expected_bytes: int, mime: str) -> None:
    parsed = allowed_callback_url(url)
    if not parsed.path.endswith("/input"):
        raise JobFailure("INVALID_INPUT")
    request = urllib.request.Request(url, headers={"X-DoMyFile-Internal-Token": token, "Accept": mime})
    try:
        with urllib.request.urlopen(request, timeout=30) as response, destination.open("wb") as output:
            content_length = int(response.headers.get("Content-Length", "0"))
            if content_length != expected_bytes:
                raise JobFailure("RESOURCE_LIMIT")
            written = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > expected_bytes:
                    raise JobFailure("RESOURCE_LIMIT")
                output.write(chunk)
            if written != expected_bytes:
                raise JobFailure("CORRUPT_FILE")
    except JobFailure:
        raise
    except (urllib.error.URLError, TimeoutError, OSError):
        raise JobFailure("UPLOAD_FAILED") from None

def post_progress(url: str, token: str, phase: str, progress: float | None) -> None:
    payload: dict[str, Any] = {"phase": phase}
    if progress is not None:
        payload["progress"] = max(0.0, min(0.9, progress))
    request = urllib.request.Request(
        url,
        method="POST",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-DoMyFile-Internal-Token": token},
    )
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except (urllib.error.URLError, TimeoutError, OSError):
        pass


@contextmanager
def process_budget(limits: dict[str, Any]):
    """Apply a per-job POSIX budget to the single active processor request."""
    resource_module: Any | None = None
    previous: dict[int, tuple[int, int]] = {}
    previous_alarm: tuple[Any, float, float] | None = None
    try:
        if os.name != "nt":
            import resource

            resource_module = resource
            for kind, requested in (
                (resource.RLIMIT_AS, int(limits["max_memory_bytes"])),
                (resource.RLIMIT_FSIZE, int(limits["max_output_bytes"]) + 1),
            ):
                soft, hard = resource.getrlimit(kind)
                previous[kind] = (soft, hard)
                bounded_soft = requested if hard == resource.RLIM_INFINITY else min(requested, hard)
                resource.setrlimit(kind, (bounded_soft, hard))

            soft, hard = resource.getrlimit(resource.RLIMIT_CPU)
            previous[resource.RLIMIT_CPU] = (soft, hard)
            usage = resource.getrusage(resource.RUSAGE_SELF)
            used_cpu = usage.ru_utime + usage.ru_stime
            requested_cpu = max(1, math.ceil(used_cpu + int(limits["max_cpu_seconds"])))
            bounded_cpu = requested_cpu if hard == resource.RLIM_INFINITY else min(requested_cpu, hard)
            resource.setrlimit(resource.RLIMIT_CPU, (bounded_cpu, hard))

            if hasattr(signal, "SIGALRM"):
                def raise_timeout(_signum: int, _frame: Any) -> None:
                    raise JobFailure("RESOURCE_LIMIT")

                previous_alarm = (signal.getsignal(signal.SIGALRM), *signal.setitimer(signal.ITIMER_REAL, 0))
                signal.signal(signal.SIGALRM, raise_timeout)
                signal.setitimer(signal.ITIMER_REAL, float(limits["max_wall_seconds"]))
        yield
    finally:
        if resource_module is not None:
            if previous_alarm is not None and hasattr(signal, "SIGALRM"):
                signal.setitimer(signal.ITIMER_REAL, 0)
                signal.signal(signal.SIGALRM, previous_alarm[0])
                if previous_alarm[1] or previous_alarm[2]:
                    signal.setitimer(signal.ITIMER_REAL, previous_alarm[1], previous_alarm[2])
            for kind, values in previous.items():
                try:
                    resource_module.setrlimit(kind, values)
                except (OSError, ValueError):
                    pass


def upload_output(url: str, token: str, source: Path, mime: str, max_output_bytes: int) -> int:
    parsed = allowed_callback_url(url)
    if not parsed.path.endswith("/output"):
        raise JobFailure("INVALID_INPUT")
    size = source.stat().st_size
    if size <= 0 or size > max_output_bytes:
        raise JobFailure("RESOURCE_LIMIT")
    connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_type(parsed.netloc, timeout=30)
    try:
        connection.putrequest("PUT", urllib.parse.urlunsplit(("", "", parsed.path, parsed.query, "")))
        connection.putheader("Content-Type", mime)
        connection.putheader("Content-Length", str(size))
        connection.putheader("X-DoMyFile-Internal-Token", token)
        connection.endheaders()
        with source.open("rb") as input_file:
            while True:
                chunk = input_file.read(1024 * 1024)
                if not chunk:
                    break
                connection.send(chunk)
        response = connection.getresponse()
        response.read()
        if response.status < 200 or response.status >= 300:
            raise JobFailure("SERVER_UNAVAILABLE")
    except JobFailure:
        raise
    except (OSError, TimeoutError):
        raise JobFailure("SERVER_UNAVAILABLE") from None
    finally:
        connection.close()
    return size


def delete_output(url: str, token: str) -> None:
    parsed = allowed_callback_url(url)
    if not parsed.path.endswith("/output"):
        return
    request = urllib.request.Request(url, method="DELETE", headers={"X-DoMyFile-Internal-Token": token})
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except (urllib.error.URLError, TimeoutError, OSError):
        pass


def run_command(command: list[str], timeout_seconds: int, max_output_bytes: int, max_memory_bytes: int, cpu_seconds: int, progress_callback: Any = None, duration_seconds: float | None = None) -> None:
    def set_resource_limits() -> None:
        try:
            import resource

            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))
            resource.setrlimit(resource.RLIMIT_FSIZE, (max_output_bytes + 1, max_output_bytes + 1))
            resource.setrlimit(resource.RLIMIT_AS, (max_memory_bytes, max_memory_bytes))
        except (ImportError, OSError, ValueError):
            pass

    process_options: dict[str, Any] = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.DEVNULL,
        "start_new_session": True,
        "text": True,
        "bufsize": 1,
    }
    if os.name != "nt":
        process_options["preexec_fn"] = set_resource_limits
    process = subprocess.Popen(command, **process_options)
    progress_lines: list[str] = []

    def read_progress() -> None:
        if process.stdout is None:
            return
        for line in process.stdout:
            progress_lines.append(line.strip())
            if line.startswith("out_time_ms=") and progress_callback and duration_seconds:
                try:
                    measured = float(line.split("=", 1)[1]) / 1_000_000
                    progress_callback(min(0.88, max(0.05, measured / duration_seconds * 0.88)))
                except ValueError:
                    pass

    reader = threading.Thread(target=read_progress, daemon=True)
    reader.start()
    deadline = time.monotonic() + timeout_seconds
    try:
        while process.poll() is None:
            if time.monotonic() > deadline:
                raise JobFailure("RESOURCE_LIMIT")
            output_path = Path(command[-1])
            if output_path.exists() and output_path.stat().st_size > max_output_bytes:
                raise JobFailure("RESOURCE_LIMIT")
            time.sleep(0.25)
        reader.join(timeout=2)
    except JobFailure:
        try:
            if os.name != "nt":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        except OSError:
            process.kill()
        process.wait(timeout=5)
        raise
    if process.returncode != 0:
        raise JobFailure("PROCESSING_FAILED")


def ffprobe(path: Path, timeout_seconds: int = 30) -> dict[str, Any]:
    command = [
        FFPROBE,
        "-v", "error",
        "-show_entries", "format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,sample_rate,channels",
        "-of", "json",
        str(path),
    ]
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout_seconds, check=False, text=True)
        if result.returncode != 0:
            raise JobFailure("CORRUPT_FILE")
        value = json.loads(result.stdout)
    except JobFailure:
        raise
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        raise JobFailure("CORRUPT_FILE") from None
    if not isinstance(value, dict) or not isinstance(value.get("streams"), list) or not isinstance(value.get("format"), dict):
        raise JobFailure("CORRUPT_FILE")
    return value


def video_input_probe(path: Path, limits: dict[str, Any]) -> dict[str, Any]:
    probe = ffprobe(path)
    streams = probe["streams"]
    video = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
    other = [stream for stream in streams if stream.get("codec_type") not in {"video", "audio"}]
    if len(video) != 1 or len(audio) > 1 or other or video[0].get("codec_name") not in {"h264", "mpeg4"} or any(stream.get("codec_name") != "aac" for stream in audio):
        raise JobFailure("UNSUPPORTED_FORMAT")
    width = int(video[0].get("width") or 0)
    height = int(video[0].get("height") or 0)
    duration = float(probe["format"].get("duration") or 0)
    if width <= 0 or height <= 0 or width > limits["max_width"] or height > limits["max_height"] or width * height > limits["max_decoded_pixels"] or duration <= 0 or duration > limits["max_duration_seconds"]:
        raise JobFailure("RESOURCE_LIMIT")
    format_name = str(probe["format"].get("format_name") or "")
    if not any(name in format_name.split(",") for name in ("mov", "mp4", "m4v")):
        raise JobFailure("UNSUPPORTED_FORMAT")
    return {"width": width, "height": height, "duration": duration, "audio_streams": len(audio)}


def video_output_probe(path: Path, source: dict[str, Any]) -> dict[str, Any]:
    probe = ffprobe(path)
    streams = probe["streams"]
    video = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
    other = [stream for stream in streams if stream.get("codec_type") not in {"video", "audio"}]
    duration = float(probe["format"].get("duration") or 0)
    format_name = str(probe["format"].get("format_name") or "")
    if len(video) != 1 or len(audio) != source["audio_streams"] or other or video[0].get("codec_name") != "vp9" or any(stream.get("codec_name") != "opus" for stream in audio) or "matroska" not in format_name and "webm" not in format_name:
        raise JobFailure("OUTPUT_INVALID")
    if int(video[0].get("width") or 0) != source["width"] or int(video[0].get("height") or 0) != source["height"] or duration <= 0 or abs(duration - source["duration"]) > max(0.1, source["duration"] * 0.02):
        raise JobFailure("OUTPUT_INVALID")
    return {"width": source["width"], "height": source["height"], "duration": duration, "audio_streams": len(audio)}


def optimize_pdf(input_path: Path, output_path: Path, preset: str, limits: dict[str, Any], progress: Any) -> dict[str, Any]:
    quality = PDF_PRESETS.get(preset, PDF_PRESETS["balanced"])
    progress(0.15)
    try:
        source = pikepdf.Pdf.open(input_path)
    except pikepdf.PasswordError:
        raise JobFailure("ENCRYPTED_PDF_UNSUPPORTED") from None
    except (pikepdf.PdfError, OSError):
        raise JobFailure("CORRUPT_FILE") from None
    with source:
        page_count = len(source.pages)
        if page_count <= 0 or page_count > limits["max_pages"]:
            raise JobFailure("RESOURCE_LIMIT")
        image_pixels = 0
        seen_images: set[tuple[int, int]] = set()
        for page in source.pages:
            for image in page.get_images().values():
                key = tuple(image.objgen)
                if key in seen_images:
                    continue
                seen_images.add(key)
                image_pixels += int(image.Width or 0) * int(image.Height or 0)
                if image_pixels > limits["max_decoded_pixels"]:
                    raise JobFailure("RESOURCE_LIMIT")
    progress(0.3)
    try:
        job = (
            pikepdf.JobBuilder()
            .input(str(input_path))
            .output(str(output_path))
            .compress(object_streams="generate", recompress_flate=True)
            .optimize_images(min_area=10_000, jpeg_quality=quality)
            .run()
        )
        if job.exit_code != 0 or not output_path.exists():
            raise JobFailure("PROCESSING_FAILED")
    except JobFailure:
        raise
    except (pikepdf.PdfError, OSError, ValueError):
        raise JobFailure("PROCESSING_FAILED") from None
    progress(0.7)
    validate_pdf(input_path, output_path, page_count)
    output_bytes = output_path.stat().st_size
    input_bytes = input_path.stat().st_size
    savings = (1 - output_bytes / input_bytes) * 100
    if output_bytes <= 0:
        raise JobFailure("OUTPUT_INVALID")
    if output_bytes > limits["max_output_bytes"]:
        raise JobFailure("RESOURCE_LIMIT")
    if output_bytes >= input_bytes or savings < limits["minimum_savings_percent"]:
        raise JobFailure("NO_USEFUL_REDUCTION")
    text_pages = count_preserved_text_pages(input_path, output_path)
    progress(0.88)
    return {
        "inputBytes": input_bytes,
        "outputBytes": output_bytes,
        "savingsPercent": savings,
        "outputMime": "application/pdf",
        "outputFormat": "PDF",
        "pageCount": page_count,
        "textPagesPreserved": text_pages,
    }


def pdf_structure(path: Path) -> tuple[int, int, int, int]:
    with pikepdf.Pdf.open(path) as pdf:
        content_pages = 0
        annotation_count = 0
        image_count = 0
        for page in pdf.pages:
            if page.get("/Contents") is not None:
                content_pages += 1
            annotations = page.get("/Annots")
            annotation_count += len(annotations) if annotations is not None else 0
            image_count += len(page.get_images())
        return len(pdf.pages), content_pages, annotation_count, image_count


def normalize_text(value: str | None) -> str:
    return " ".join((value or "").split())


def pdf_texts(path: Path) -> list[str]:
    try:
        reader = PdfReader(str(path), strict=False)
        return [normalize_text(page.extract_text()) for page in reader.pages]
    except Exception:
        raise JobFailure("OUTPUT_INVALID") from None


def validate_pdf(input_path: Path, output_path: Path, page_count: int) -> None:
    with output_path.open("rb") as output_file:
        if output_file.read(5) != b"%PDF-":
            raise JobFailure("OUTPUT_INVALID")
    try:
        output_pages, output_content_pages, output_annotations, _ = pdf_structure(output_path)
        input_pages, input_content_pages, input_annotations, _ = pdf_structure(input_path)
    except (pikepdf.PdfError, OSError):
        raise JobFailure("OUTPUT_INVALID") from None
    if output_pages != page_count or output_pages != input_pages or output_content_pages < input_content_pages or output_annotations < input_annotations:
        raise JobFailure("OUTPUT_INVALID")
    source_text = pdf_texts(input_path)
    output_text = pdf_texts(output_path)
    if len(source_text) != len(output_text):
        raise JobFailure("OUTPUT_INVALID")
    for source_page, output_page in zip(source_text, output_text):
        if source_page and not output_page:
            raise JobFailure("OUTPUT_INVALID")


def count_preserved_text_pages(input_path: Path, output_path: Path) -> int:
    source = pdf_texts(input_path)
    output = pdf_texts(output_path)
    return sum(1 for before, after in zip(source, output) if before and after)


def compress_video(input_path: Path, output_path: Path, preset: str, limits: dict[str, Any], progress: Any) -> dict[str, Any]:
    source = video_input_probe(input_path, limits)
    progress(0.15)
    profile = VIDEO_PRESETS.get(preset, VIDEO_PRESETS["balanced"])
    command = [
        FFMPEG,
        "-hide_banner",
        "-nostdin",
        "-loglevel", "error",
        "-y",
        "-i", str(input_path),
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-c:v", "libvpx-vp9",
        "-deadline", "good",
        "-cpu-used", "2",
        "-row-mt", "1",
        "-crf", str(profile["crf"]),
        "-b:v", "0",
        "-c:a", "libopus",
        "-b:a", profile["audio_bitrate"],
        "-map_metadata", "-1",
        "-f", "webm",
        "-progress", "pipe:1",
        "-nostats",
        str(output_path),
    ]
    run_command(command, limits["max_wall_seconds"], limits["max_output_bytes"], limits["max_memory_bytes"], limits["max_cpu_seconds"], progress, source["duration"])
    progress(0.9)
    output = video_output_probe(output_path, source)
    output_bytes = output_path.stat().st_size
    input_bytes = input_path.stat().st_size
    savings = (1 - output_bytes / input_bytes) * 100
    if output_bytes <= 0:
        raise JobFailure("OUTPUT_INVALID")
    if output_bytes > limits["max_output_bytes"]:
        raise JobFailure("RESOURCE_LIMIT")
    if output_bytes >= input_bytes or savings < limits["minimum_savings_percent"]:
        raise JobFailure("NO_USEFUL_REDUCTION")
    return {
        "inputBytes": input_bytes,
        "outputBytes": output_bytes,
        "savingsPercent": savings,
        "outputMime": "video/webm",
        "outputFormat": "WebM",
        "durationSeconds": output["duration"],
        "width": output["width"],
        "height": output["height"],
        "audioStreams": output["audio_streams"],
    }


def process_job(value: dict[str, Any]) -> dict[str, Any]:
    tool_id = value.get("toolId")
    preset = value.get("preset")
    if tool_id not in {"PDF-01", "VID-01"} or preset not in {"quality", "balanced", "smaller"}:
        raise JobFailure("INVALID_INPUT")
    input_url = allowed_callback_url(value.get("inputUrl"))
    output_url = allowed_callback_url(value.get("outputUrl"))
    progress_url = allowed_callback_url(value.get("progressUrl"))
    same_gateway(input_url, output_url, progress_url)
    input_token = value.get("inputToken")
    output_token = value.get("outputToken")
    progress_token = value.get("progressToken")
    if not all(isinstance(token, str) and token for token in (input_token, output_token, progress_token)):
        raise JobFailure("INVALID_INPUT")
    expected_bytes = int(value.get("inputBytes") or 0)
    limits = PDF_LIMITS if tool_id == "PDF-01" else VIDEO_LIMITS
    if expected_bytes <= 0 or expected_bytes > limits["max_upload_bytes"]:
        raise JobFailure("RESOURCE_LIMIT")
    mime = "application/pdf" if tool_id == "PDF-01" else str(value.get("inputMime") or "")
    allowed_mimes = {"application/pdf"} if tool_id == "PDF-01" else {"video/mp4", "video/quicktime"}
    if mime not in allowed_mimes:
        raise JobFailure("UNSUPPORTED_FORMAT")
    with tempfile.TemporaryDirectory(prefix="domyfile-job-") as temporary_directory:
        directory = Path(temporary_directory)
        input_path = directory / "input.bin"
        output_path = directory / ("output.pdf" if tool_id == "PDF-01" else "output.webm")
        download_input(urllib.parse.urlunparse(input_url), input_token, input_path, expected_bytes, mime)
        post_progress(urllib.parse.urlunparse(progress_url), progress_token, "validating", 0.05)
        with process_budget(limits):
            if tool_id == "PDF-01":
                result = optimize_pdf(input_path, output_path, preset, limits, lambda value: post_progress(urllib.parse.urlunparse(progress_url), progress_token, "processing", value))
            else:
                result = compress_video(input_path, output_path, preset, limits, lambda value: post_progress(urllib.parse.urlunparse(progress_url), progress_token, "processing", value))
        post_progress(urllib.parse.urlunparse(progress_url), progress_token, "verifying", 0.9)
        upload_output(urllib.parse.urlunparse(output_url), output_token, output_path, result["outputMime"], limits["max_output_bytes"])
        return result


class ProcessorHandler(BaseHTTPRequestHandler):
    server_version = "DoMyFileCompression/1"

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/health":
            json_response(self, {"ok": True})
            return
        json_response(self, {"code": "INVALID_INPUT"}, 404)

    def do_POST(self) -> None:
        if self.path != "/process":
            json_response(self, {"code": "INVALID_INPUT"}, 404)
            return
        try:
            value = read_json(self)
            if self.headers.get("X-DoMyFile-Internal-Token") != value.get("progressToken"):
                raise JobFailure("INVALID_INPUT")
            result = process_job(value)
            json_response(self, {"ok": True, "result": result})
        except JobFailure as error:
            status = 413 if error.code == "RESOURCE_LIMIT" else 422
            json_response(self, {"ok": False, "code": error.code}, status)
        except Exception:
            json_response(self, {"ok": False, "code": "PROCESSING_FAILED"}, 500)


def main() -> None:
    HTTPServer(("0.0.0.0", PORT), ProcessorHandler).serve_forever()


if __name__ == "__main__":
    main()
