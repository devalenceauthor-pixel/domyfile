from __future__ import annotations

import asyncio
import json
import math
import os
import shutil
import signal
import subprocess
import tempfile
import time
import uuid
import zipfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import pikepdf
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pypdf import PdfReader
from starlette.background import BackgroundTask


class BackendFailure(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


ERROR_MESSAGES = {
    "INVALID_INPUT": "Choose one supported file and try again.",
    "UNSUPPORTED_FORMAT": "This file format or content layout is not supported by this tool.",
    "CORRUPT_FILE": "The file could not be read safely. Try an uncorrupted copy.",
    "ENCRYPTED_PDF_UNSUPPORTED": "Password-protected PDFs are not supported by this tool.",
    "RESOURCE_LIMIT": "This file is above the tested processing limits. Try a smaller, shorter, or lower-resolution file.",
    "UPLOAD_FAILED": "The temporary upload could not finish. Check your connection and try again.",
    "SERVER_UNAVAILABLE": "Temporary processing is unavailable right now. Your original file was not changed.",
    "RATE_LIMITED": "Too many processing requests were sent. Please wait a moment and try again.",
    "NO_USEFUL_REDUCTION": "This file could not be made meaningfully smaller with the selected preset.",
    "OUTPUT_INVALID": "The generated file did not pass validation, so no download was created.",
    "PROCESSING_FAILED": "The file could not be processed safely. Try a different supported file.",
}


@dataclass(frozen=True)
class ToolSpec:
    input_mimes: frozenset[str]
    output_mime: str
    output_format: str
    output_name: str
    input_extension: str
    output_extension: str
    max_upload_bytes: int
    max_output_bytes: int
    max_memory_bytes: int
    max_cpu_seconds: int
    max_wall_seconds: int
    max_pages: int | None = None
    max_duration_seconds: int | None = None
    max_width: int | None = None
    max_height: int | None = None
    max_decoded_pixels: int | None = None
    minimum_savings_percent: float = 0
    require_reduction: bool = False


# This is deliberately the complete public processing allowlist. Do not add a
# generic command or a tool ID here without also adding its fixed processor,
# input contract, output validator, and tests.
TOOL_SPECS: dict[str, ToolSpec] = {
    "PDF-01": ToolSpec(
        input_mimes=frozenset({"application/pdf"}),
        output_mime="application/pdf",
        output_format="PDF",
        output_name="compressed-document.pdf",
        input_extension=".pdf",
        output_extension=".pdf",
        max_upload_bytes=50 * 1024 * 1024,
        max_output_bytes=60 * 1024 * 1024,
        max_memory_bytes=420 * 1024 * 1024,
        max_cpu_seconds=60,
        max_wall_seconds=120,
        max_pages=200,
        max_decoded_pixels=150_000_000,
        minimum_savings_percent=5,
        require_reduction=True,
    ),
    "VID-01": ToolSpec(
        input_mimes=frozenset({"video/mp4", "video/quicktime"}),
        output_mime="video/webm",
        output_format="WebM",
        output_name="compressed-video.webm",
        input_extension=".video",
        output_extension=".webm",
        max_upload_bytes=64 * 1024 * 1024,
        max_output_bytes=64 * 1024 * 1024,
        max_memory_bytes=420 * 1024 * 1024,
        max_cpu_seconds=180,
        max_wall_seconds=240,
        max_duration_seconds=180,
        max_width=1920,
        max_height=1080,
        max_decoded_pixels=1920 * 1080,
        minimum_savings_percent=5,
        require_reduction=True,
    ),
    "DOC-04": ToolSpec(
        input_mimes=frozenset({"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),
        output_mime="application/pdf",
        output_format="PDF",
        output_name="converted-document.pdf",
        input_extension=".docx",
        output_extension=".pdf",
        max_upload_bytes=25 * 1024 * 1024,
        max_output_bytes=60 * 1024 * 1024,
        max_memory_bytes=420 * 1024 * 1024,
        max_cpu_seconds=120,
        max_wall_seconds=180,
        max_pages=200,
    ),
    "DOC-05": ToolSpec(
        input_mimes=frozenset({"application/pdf"}),
        output_mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        output_format="DOCX",
        output_name="converted-document.docx",
        input_extension=".pdf",
        output_extension=".docx",
        max_upload_bytes=25 * 1024 * 1024,
        max_output_bytes=60 * 1024 * 1024,
        max_memory_bytes=420 * 1024 * 1024,
        max_cpu_seconds=120,
        max_wall_seconds=180,
        max_pages=200,
    ),
}

PRESETS = {"quality", "balanced", "smaller"}
PDF_PRESETS = {"quality": 85, "balanced": 75, "smaller": 60}
VIDEO_PRESETS = {
    "quality": {"crf": "32", "audio_bitrate": "96k"},
    "balanced": {"crf": "38", "audio_bitrate": "64k"},
    "smaller": {"crf": "43", "audio_bitrate": "48k"},
}

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_BIN", "ffprobe")
SOFFICE = os.environ.get("SOFFICE_BIN", "soffice")
TEMP_ROOT = Path(os.environ.get("TMPDIR", tempfile.gettempdir()))
TEMP_PREFIX = "domyfile-render-"
MAX_FORM_OVERHEAD = 256 * 1024


def user_message(code: str) -> str:
    return ERROR_MESSAGES.get(code, ERROR_MESSAGES["PROCESSING_FAILED"])


def error_status(code: str) -> int:
    if code == "RESOURCE_LIMIT":
        return 413
    if code == "UNSUPPORTED_FORMAT":
        return 415
    if code in {"CORRUPT_FILE", "ENCRYPTED_PDF_UNSUPPORTED", "OUTPUT_INVALID", "NO_USEFUL_REDUCTION"}:
        return 422
    if code in {"SERVER_UNAVAILABLE", "PROCESSING_FAILED"}:
        return 503
    return 400


def error_body(code: str, request_id: str, status: int | None = None) -> JSONResponse:
    return JSONResponse(
        {"code": code, "message": user_message(code), "requestId": request_id},
        status_code=status or error_status(code),
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


def cleanup_directory(directory: Path) -> None:
    shutil.rmtree(directory, ignore_errors=True)


def cleanup_stale_directories(max_age_seconds: int = 3600) -> None:
    now = time.time()
    if not TEMP_ROOT.exists():
        return
    for directory in TEMP_ROOT.glob(f"{TEMP_PREFIX}*"):
        try:
            if directory.is_dir() and now - directory.stat().st_mtime > max_age_seconds:
                cleanup_directory(directory)
        except OSError:
            continue


def ascii_at(value: bytes, offset: int, length: int) -> str:
    return value[offset:offset + length].decode("latin-1", errors="ignore")


def has_video_brand(value: bytes) -> bool:
    if len(value) < 12 or value[4:8] != b"ftyp":
        return False
    allowed = {"isom", "iso2", "iso5", "mp41", "mp42", "avc1", "M4V ", "qt  "}
    brands = [ascii_at(value, 8, 4)]
    brands.extend(ascii_at(value, offset, 4) for offset in range(16, min(len(value), 128), 4))
    return any(brand in allowed for brand in brands)


def validate_magic(tool_id: str, mime: str, head: bytes) -> None:
    if tool_id in {"PDF-01", "DOC-05"}:
        if mime != "application/pdf" or not head.startswith(b"%PDF-"):
            raise BackendFailure("UNSUPPORTED_FORMAT")
        return
    if tool_id == "DOC-04":
        if mime != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or not head.startswith(b"PK\x03\x04"):
            raise BackendFailure("UNSUPPORTED_FORMAT")
        return
    if mime not in {"video/mp4", "video/quicktime"} or not has_video_brand(head):
        raise BackendFailure("UNSUPPORTED_FORMAT")
    if mime == "video/quicktime" and b"qt  " not in head:
        raise BackendFailure("UNSUPPORTED_FORMAT")


def validate_declared_input(tool_id: str, declared_mime: str, part_mime: str | None) -> ToolSpec:
    spec = TOOL_SPECS.get(tool_id)
    if spec is None or not isinstance(declared_mime, str) or not declared_mime:
        raise BackendFailure("INVALID_INPUT")
    declared_mime = declared_mime.strip().lower()
    part_mime = (part_mime or "").strip().lower()
    if declared_mime not in spec.input_mimes or part_mime != declared_mime:
        raise BackendFailure("UNSUPPORTED_FORMAT")
    return spec


def validate_preset(value: str) -> str:
    if value not in PRESETS:
        raise BackendFailure("INVALID_INPUT")
    return value


async def save_upload(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    written = 0
    try:
        with destination.open("wb") as output:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise BackendFailure("RESOURCE_LIMIT")
                output.write(chunk)
    except BackendFailure:
        raise
    except (OSError, ValueError):
        raise BackendFailure("UPLOAD_FAILED") from None
    if written <= 0:
        raise BackendFailure("INVALID_INPUT")
    return written


def _kill_process(process: subprocess.Popen[bytes]) -> None:
    try:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
    except OSError:
        try:
            process.kill()
        except OSError:
            pass


def _child_limits(spec: ToolSpec) -> None:
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (spec.max_cpu_seconds, spec.max_cpu_seconds + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (spec.max_output_bytes + 1, spec.max_output_bytes + 1))
        resource.setrlimit(resource.RLIMIT_AS, (spec.max_memory_bytes, spec.max_memory_bytes))
    except (ImportError, OSError, ValueError):
        return


def run_fixed_command(command: list[str], spec: ToolSpec, capture_stdout: bool = False) -> str:
    """Run one application-owned command template with no shell or user args."""
    process_options: dict[str, Any] = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.PIPE if capture_stdout else subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "start_new_session": True,
    }
    if os.name != "nt":
        process_options["preexec_fn"] = lambda: _child_limits(spec)
    try:
        process = subprocess.Popen(command, **process_options)
    except (OSError, ValueError):
        raise BackendFailure("SERVER_UNAVAILABLE") from None
    try:
        stdout, _ = process.communicate(timeout=spec.max_wall_seconds)
    except subprocess.TimeoutExpired:
        _kill_process(process)
        process.communicate()
        raise BackendFailure("RESOURCE_LIMIT") from None
    except (OSError, ValueError):
        _kill_process(process)
        process.communicate()
        raise BackendFailure("PROCESSING_FAILED") from None
    if process.returncode != 0:
        raise BackendFailure("PROCESSING_FAILED")
    if not capture_stdout:
        return ""
    return (stdout or b"").decode("utf-8", errors="replace")


def ffprobe(path: Path, spec: ToolSpec) -> dict[str, Any]:
    command = [
        FFPROBE,
        "-v", "error",
        "-show_entries", "format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,sample_rate,channels",
        "-of", "json",
        str(path),
    ]
    try:
        value = json.loads(run_fixed_command(command, spec, capture_stdout=True))
    except BackendFailure:
        raise BackendFailure("CORRUPT_FILE") from None
    except (json.JSONDecodeError, TypeError):
        raise BackendFailure("CORRUPT_FILE") from None
    if not isinstance(value, dict) or not isinstance(value.get("streams"), list) or not isinstance(value.get("format"), dict):
        raise BackendFailure("CORRUPT_FILE")
    return value


def video_input_probe(path: Path, spec: ToolSpec) -> dict[str, Any]:
    probe = ffprobe(path, spec)
    streams = probe["streams"]
    video = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
    other = [stream for stream in streams if stream.get("codec_type") not in {"video", "audio"}]
    if len(video) != 1 or len(audio) > 1 or other:
        raise BackendFailure("UNSUPPORTED_FORMAT")
    if video[0].get("codec_name") not in {"h264", "mpeg4"} or any(stream.get("codec_name") != "aac" for stream in audio):
        raise BackendFailure("UNSUPPORTED_FORMAT")
    width = int(video[0].get("width") or 0)
    height = int(video[0].get("height") or 0)
    duration = float(probe["format"].get("duration") or 0)
    if (
        width <= 0
        or height <= 0
        or width > (spec.max_width or width)
        or height > (spec.max_height or height)
        or width * height > (spec.max_decoded_pixels or width * height)
        or duration <= 0
        or duration > (spec.max_duration_seconds or duration)
    ):
        raise BackendFailure("RESOURCE_LIMIT")
    format_name = str(probe["format"].get("format_name") or "")
    if not any(name in format_name.split(",") for name in ("mov", "mp4", "m4v")):
        raise BackendFailure("UNSUPPORTED_FORMAT")
    return {"width": width, "height": height, "duration": duration, "audio_streams": len(audio)}


def video_output_probe(path: Path, source: dict[str, Any], spec: ToolSpec) -> dict[str, Any]:
    probe = ffprobe(path, spec)
    streams = probe["streams"]
    video = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio = [stream for stream in streams if stream.get("codec_type") == "audio"]
    other = [stream for stream in streams if stream.get("codec_type") not in {"video", "audio"}]
    duration = float(probe["format"].get("duration") or 0)
    format_name = str(probe["format"].get("format_name") or "")
    if (
        len(video) != 1
        or len(audio) != source["audio_streams"]
        or other
        or video[0].get("codec_name") != "vp9"
        or any(stream.get("codec_name") != "opus" for stream in audio)
        or not ({"matroska", "webm"} & set(format_name.split(",")))
    ):
        raise BackendFailure("OUTPUT_INVALID")
    if (
        int(video[0].get("width") or 0) != source["width"]
        or int(video[0].get("height") or 0) != source["height"]
        or duration <= 0
        or abs(duration - source["duration"]) > max(0.1, source["duration"] * 0.02)
    ):
        raise BackendFailure("OUTPUT_INVALID")
    return {"width": source["width"], "height": source["height"], "duration": duration, "audio_streams": len(audio)}


def normalize_text(value: str | None) -> str:
    return " ".join((value or "").split())


def pdf_texts(path: Path) -> list[str]:
    try:
        reader = PdfReader(str(path), strict=False)
        return [normalize_text(page.extract_text()) for page in reader.pages]
    except Exception:
        raise BackendFailure("OUTPUT_INVALID") from None


def pdf_structure(path: Path) -> tuple[int, int, int]:
    try:
        with pikepdf.Pdf.open(path) as pdf:
            content_pages = 0
            annotation_count = 0
            for page in pdf.pages:
                if page.get("/Contents") is not None:
                    content_pages += 1
                annotations = page.get("/Annots")
                annotation_count += len(annotations) if annotations is not None else 0
            return len(pdf.pages), content_pages, annotation_count
    except (pikepdf.PdfError, OSError):
        raise BackendFailure("OUTPUT_INVALID") from None


def validate_pdf(input_path: Path, output_path: Path, page_count: int) -> None:
    try:
        with output_path.open("rb") as source:
            if source.read(5) != b"%PDF-":
                raise BackendFailure("OUTPUT_INVALID")
    except OSError:
        raise BackendFailure("OUTPUT_INVALID") from None
    output_pages, output_content_pages, output_annotations = pdf_structure(output_path)
    input_pages, input_content_pages, input_annotations = pdf_structure(input_path)
    if output_pages != page_count or output_pages != input_pages or output_content_pages < input_content_pages or output_annotations < input_annotations:
        raise BackendFailure("OUTPUT_INVALID")
    source_text = pdf_texts(input_path)
    output_text = pdf_texts(output_path)
    if len(source_text) != len(output_text):
        raise BackendFailure("OUTPUT_INVALID")
    for source_page, output_page in zip(source_text, output_text):
        if source_page and not output_page:
            raise BackendFailure("OUTPUT_INVALID")


def count_preserved_text_pages(input_path: Path, output_path: Path) -> int:
    source = pdf_texts(input_path)
    output = pdf_texts(output_path)
    return sum(1 for before, after in zip(source, output) if before and after)


def optimize_pdf(input_path: Path, output_path: Path, preset: str, spec: ToolSpec) -> dict[str, Any]:
    try:
        source = pikepdf.Pdf.open(input_path)
    except pikepdf.PasswordError:
        raise BackendFailure("ENCRYPTED_PDF_UNSUPPORTED") from None
    except (pikepdf.PdfError, OSError):
        raise BackendFailure("CORRUPT_FILE") from None
    with source:
        page_count = len(source.pages)
        if page_count <= 0 or page_count > (spec.max_pages or page_count):
            raise BackendFailure("RESOURCE_LIMIT")
        image_pixels = 0
        seen_images: set[tuple[int, int]] = set()
        for page in source.pages:
            for image in page.get_images().values():
                key = tuple(image.objgen)
                if key in seen_images:
                    continue
                seen_images.add(key)
                image_pixels += int(image.Width or 0) * int(image.Height or 0)
                if image_pixels > (spec.max_decoded_pixels or image_pixels):
                    raise BackendFailure("RESOURCE_LIMIT")
    try:
        job = (
            pikepdf.JobBuilder()
            .input(str(input_path))
            .output(str(output_path))
            .compress(object_streams="generate", recompress_flate=True)
            .optimize_images(min_area=10_000, jpeg_quality=PDF_PRESETS[preset])
            .run()
        )
        if job.exit_code != 0 or not output_path.exists():
            raise BackendFailure("PROCESSING_FAILED")
    except BackendFailure:
        raise
    except (pikepdf.PdfError, OSError, ValueError):
        raise BackendFailure("PROCESSING_FAILED") from None
    validate_pdf(input_path, output_path, page_count)
    input_bytes = input_path.stat().st_size
    output_bytes = output_path.stat().st_size
    savings = (1 - output_bytes / input_bytes) * 100
    if output_bytes <= 0:
        raise BackendFailure("OUTPUT_INVALID")
    if output_bytes > spec.max_output_bytes:
        raise BackendFailure("RESOURCE_LIMIT")
    if output_bytes >= input_bytes or savings < spec.minimum_savings_percent:
        raise BackendFailure("NO_USEFUL_REDUCTION")
    return {
        "inputBytes": input_bytes,
        "outputBytes": output_bytes,
        "savingsPercent": savings,
        "outputMime": spec.output_mime,
        "outputFormat": spec.output_format,
        "pageCount": page_count,
        "textPagesPreserved": count_preserved_text_pages(input_path, output_path),
    }


def validate_docx_archive(path: Path, output: bool = False) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise BackendFailure("OUTPUT_INVALID" if output else "CORRUPT_FILE")
            if len(names) > 2000:
                raise BackendFailure("RESOURCE_LIMIT")
            total_uncompressed = 0
            for info in archive.infolist():
                name = Path(info.filename)
                if name.is_absolute() or ".." in name.parts:
                    raise BackendFailure("CORRUPT_FILE")
                total_uncompressed += info.file_size
                if info.file_size > 50 * 1024 * 1024 or total_uncompressed > 200 * 1024 * 1024:
                    raise BackendFailure("RESOURCE_LIMIT")
            if archive.getinfo("word/document.xml").file_size <= 0:
                raise BackendFailure("OUTPUT_INVALID" if output else "CORRUPT_FILE")
    except BackendFailure:
        raise
    except (OSError, zipfile.BadZipFile, KeyError):
        raise BackendFailure("OUTPUT_INVALID" if output else "CORRUPT_FILE") from None


def pdf_input_details(path: Path, spec: ToolSpec) -> tuple[int, int]:
    try:
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted:
            raise BackendFailure("ENCRYPTED_PDF_UNSUPPORTED")
        page_count = len(reader.pages)
        if page_count <= 0 or page_count > (spec.max_pages or page_count):
            raise BackendFailure("RESOURCE_LIMIT")
        text_pages = sum(1 for page in reader.pages if normalize_text(page.extract_text()))
        return page_count, text_pages
    except BackendFailure:
        raise
    except Exception:
        raise BackendFailure("CORRUPT_FILE") from None


def validate_converted_pdf(path: Path, spec: ToolSpec) -> int:
    try:
        with path.open("rb") as source:
            if source.read(5) != b"%PDF-":
                raise BackendFailure("OUTPUT_INVALID")
        reader = PdfReader(str(path), strict=False)
        if reader.is_encrypted:
            raise BackendFailure("OUTPUT_INVALID")
        page_count = len(reader.pages)
        if page_count <= 0 or page_count > (spec.max_pages or page_count):
            raise BackendFailure("OUTPUT_INVALID")
        for page in reader.pages:
            page.extract_text()
        return page_count
    except BackendFailure:
        raise
    except Exception:
        raise BackendFailure("OUTPUT_INVALID") from None


def convert_document(input_path: Path, output_path: Path, tool_id: str, spec: ToolSpec) -> dict[str, Any]:
    if tool_id == "DOC-04":
        validate_docx_archive(input_path)
        source_extension = ".docx"
        output_extension = ".pdf"
        conversion_filter = "pdf:writer_pdf_Export"
        page_count = None
        text_pages = None
    elif tool_id == "DOC-05":
        page_count, text_pages = pdf_input_details(input_path, spec)
        if text_pages <= 0:
            raise BackendFailure("UNSUPPORTED_FORMAT")
        source_extension = ".pdf"
        output_extension = ".docx"
        conversion_filter = "docx:Office Open XML Text"
    else:
        raise BackendFailure("INVALID_INPUT")

    with tempfile.TemporaryDirectory(prefix=f"{TEMP_PREFIX}lo-") as conversion_directory:
        directory = Path(conversion_directory)
        profile = directory / "profile"
        output_directory = directory / "output"
        profile.mkdir()
        output_directory.mkdir()
        named_input = directory / f"source{source_extension}"
        expected_output = output_directory / f"source{output_extension}"
        shutil.copyfile(input_path, named_input)
        command = [
            SOFFICE,
            "--headless",
            "--invisible",
            "--nodefault",
            "--nologo",
            "--nolockcheck",
            "--norestore",
            f"-env:UserInstallation={profile.as_uri()}",
        ]
        if tool_id == "DOC-05":
            command.append("--infilter=writer_pdf_import")
        command.extend(["--convert-to", conversion_filter, "--outdir", str(output_directory), str(named_input)])
        run_fixed_command(command, spec)
        if not expected_output.exists() or expected_output.stat().st_size <= 0:
            raise BackendFailure("PROCESSING_FAILED")
        shutil.copyfile(expected_output, output_path)

    if tool_id == "DOC-04":
        converted_pages = validate_converted_pdf(output_path, spec)
        extra = {"pageCount": converted_pages}
    else:
        validate_docx_archive(output_path, output=True)
        extra = {"pageCount": page_count, "textPagesPreserved": text_pages}
    input_bytes = input_path.stat().st_size
    output_bytes = output_path.stat().st_size
    if output_bytes <= 0 or output_bytes > spec.max_output_bytes:
        raise BackendFailure("OUTPUT_INVALID" if output_bytes <= 0 else "RESOURCE_LIMIT")
    return {
        "inputBytes": input_bytes,
        "outputBytes": output_bytes,
        "savingsPercent": (1 - output_bytes / input_bytes) * 100,
        "outputMime": spec.output_mime,
        "outputFormat": spec.output_format,
        **extra,
    }


def compress_video(input_path: Path, output_path: Path, preset: str, spec: ToolSpec) -> dict[str, Any]:
    source = video_input_probe(input_path, spec)
    profile = VIDEO_PRESETS[preset]
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
        "-cpu-used", "4",
        "-row-mt", "1",
        "-crf", profile["crf"],
        "-b:v", "0",
        "-c:a", "libopus",
        "-b:a", profile["audio_bitrate"],
        "-map_metadata", "-1",
        "-f", "webm",
        str(output_path),
    ]
    run_fixed_command(command, spec)
    if not output_path.exists() or output_path.stat().st_size <= 0:
        raise BackendFailure("OUTPUT_INVALID")
    output = video_output_probe(output_path, source, spec)
    input_bytes = input_path.stat().st_size
    output_bytes = output_path.stat().st_size
    savings = (1 - output_bytes / input_bytes) * 100
    if output_bytes > spec.max_output_bytes:
        raise BackendFailure("RESOURCE_LIMIT")
    if output_bytes >= input_bytes or savings < spec.minimum_savings_percent:
        raise BackendFailure("NO_USEFUL_REDUCTION")
    return {
        "inputBytes": input_bytes,
        "outputBytes": output_bytes,
        "savingsPercent": savings,
        "outputMime": spec.output_mime,
        "outputFormat": spec.output_format,
        "durationSeconds": output["duration"],
        "width": output["width"],
        "height": output["height"],
        "audioStreams": output["audio_streams"],
    }


def run_processor(tool_id: str, input_path: Path, output_path: Path, preset: str, spec: ToolSpec) -> dict[str, Any]:
    if tool_id == "PDF-01":
        return optimize_pdf(input_path, output_path, preset, spec)
    if tool_id == "VID-01":
        return compress_video(input_path, output_path, preset, spec)
    return convert_document(input_path, output_path, tool_id, spec)


def set_python_wall_limit(seconds: int) -> Callable[[], None]:
    if os.name == "nt" or not hasattr(signal, "SIGALRM"):
        return lambda: None
    previous = signal.getsignal(signal.SIGALRM)
    previous_timer = signal.setitimer(signal.ITIMER_REAL, 0)

    def raise_timeout(_signum: int, _frame: Any) -> None:
        raise BackendFailure("RESOURCE_LIMIT")

    signal.signal(signal.SIGALRM, raise_timeout)
    signal.setitimer(signal.ITIMER_REAL, float(seconds))

    def restore() -> None:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)
        if previous_timer[0] or previous_timer[1]:
            signal.setitimer(signal.ITIMER_REAL, previous_timer[0], previous_timer[1])

    return restore


async def process_request_file(tool_id: str, declared_mime: str, part_mime: str | None, preset: str, upload: UploadFile, request_id: str) -> tuple[Path, Path, dict[str, Any], ToolSpec]:
    spec = validate_declared_input(tool_id, declared_mime, part_mime)
    preset = validate_preset(preset)
    temp_directory = Path(tempfile.mkdtemp(prefix=TEMP_PREFIX, dir=str(TEMP_ROOT)))
    input_path = temp_directory / f"input{spec.input_extension if spec.input_extension != '.video' else '.mp4'}"
    output_path = temp_directory / f"output{spec.output_extension}"
    try:
        input_bytes = await save_upload(upload, input_path, spec.max_upload_bytes)
        with input_path.open("rb") as source:
            head = source.read(256)
        validate_magic(tool_id, declared_mime.strip().lower(), head)
        if tool_id == "DOC-04":
            validate_docx_archive(input_path)
        elif tool_id == "DOC-05":
            pdf_input_details(input_path, spec)
        elif tool_id == "PDF-01":
            # Opening and bounding the file before optimization provides a clear
            # corrupt/encrypted/resource error without entering the optimizer.
            try:
                with pikepdf.Pdf.open(input_path) as pdf:
                    if len(pdf.pages) <= 0 or len(pdf.pages) > (spec.max_pages or len(pdf.pages)):
                        raise BackendFailure("RESOURCE_LIMIT")
            except pikepdf.PasswordError:
                raise BackendFailure("ENCRYPTED_PDF_UNSUPPORTED") from None
            except pikepdf.PdfError:
                raise BackendFailure("CORRUPT_FILE") from None
        else:
            video_input_probe(input_path, spec)
        processor_started = time.perf_counter()
        restore_limit = set_python_wall_limit(spec.max_wall_seconds)
        try:
            # Render Free is intentionally kept to one native processor at a
            # time. Keeping this synchronous also lets the POSIX wall timer
            # interrupt the active native/PDF operation instead of leaving a
            # detached worker behind after a timeout.
            result = run_processor(tool_id, input_path, output_path, preset, spec)
        finally:
            restore_limit()
        result["_processorMs"] = round((time.perf_counter() - processor_started) * 1000, 2)
        result["requestId"] = request_id
        if result.get("inputBytes") != input_bytes:
            raise BackendFailure("PROCESSING_FAILED")
        return temp_directory, output_path, result, spec
    except BackendFailure:
        cleanup_directory(temp_directory)
        raise
    except (OSError, pikepdf.PdfError, zipfile.BadZipFile):
        cleanup_directory(temp_directory)
        raise BackendFailure("PROCESSING_FAILED") from None
    except Exception:
        cleanup_directory(temp_directory)
        raise BackendFailure("PROCESSING_FAILED") from None


FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "https://domyfile.web.id").strip()
PROCESSING_LOCK = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    cleanup_stale_directories()
    yield


app = FastAPI(title="DoMyFile Render processing", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN else [],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
    expose_headers=[
        "Content-Disposition",
        "X-DoMyFile-Request-Id",
        "X-DoMyFile-Input-Bytes",
        "X-DoMyFile-Output-Bytes",
        "X-DoMyFile-Savings-Percent",
        "X-DoMyFile-Processor-Ms",
        "X-DoMyFile-Backend-Ms",
        "X-DoMyFile-Page-Count",
        "X-DoMyFile-Text-Pages-Preserved",
        "X-DoMyFile-Duration-Seconds",
        "X-DoMyFile-Width",
        "X-DoMyFile-Height",
        "X-DoMyFile-Audio-Streams",
    ],
    max_age=600,
)


@app.get("/health")
async def health() -> dict[str, Any]:
    cleanup_stale_directories()
    return {"ok": True, "tools": sorted(TOOL_SPECS)}


@app.post("/v1/process", response_model=None)
async def process(
    request: Request,
    toolId: str = Form(...),
    inputMime: str = Form(...),
    preset: str = Form("balanced"),
    file: UploadFile = File(...),
):
    request_id = uuid.uuid4().hex
    backend_started = time.perf_counter()
    cleanup_stale_directories()
    spec = TOOL_SPECS.get(toolId)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_length = int(content_length)
        except ValueError:
            return error_body("INVALID_INPUT", request_id)
        max_body = (spec.max_upload_bytes if spec else max(item.max_upload_bytes for item in TOOL_SPECS.values())) + MAX_FORM_OVERHEAD
        if declared_length <= 0 or declared_length > max_body:
            return error_body("RESOURCE_LIMIT", request_id)
    queued_cleanup = False
    temp_directory: Path | None = None
    try:
        async with PROCESSING_LOCK:
            temp_directory, output_path, result, spec = await process_request_file(
                toolId,
                inputMime,
                file.content_type,
                preset,
                file,
                request_id,
            )
        headers = {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-DoMyFile-Request-Id": request_id,
            "X-DoMyFile-Input-Bytes": str(result["inputBytes"]),
            "X-DoMyFile-Output-Bytes": str(result["outputBytes"]),
            "X-DoMyFile-Savings-Percent": f"{float(result['savingsPercent']):.4f}",
            "X-DoMyFile-Processor-Ms": str(result.get("_processorMs", 0)),
            "X-DoMyFile-Backend-Ms": str(round((time.perf_counter() - backend_started) * 1000, 2)),
        }
        header_map = {
            "pageCount": "X-DoMyFile-Page-Count",
            "textPagesPreserved": "X-DoMyFile-Text-Pages-Preserved",
            "durationSeconds": "X-DoMyFile-Duration-Seconds",
            "width": "X-DoMyFile-Width",
            "height": "X-DoMyFile-Height",
            "audioStreams": "X-DoMyFile-Audio-Streams",
        }
        for key, header in header_map.items():
            if key in result and result[key] is not None:
                headers[header] = str(result[key])
        response = FileResponse(
            output_path,
            media_type=spec.output_mime,
            filename=spec.output_name,
            headers=headers,
            background=BackgroundTask(cleanup_directory, temp_directory),
        )
        queued_cleanup = True
        return response
    except BackendFailure as error:
        return error_body(error.code, request_id)
    except asyncio.CancelledError:
        raise
    except Exception:
        return error_body("PROCESSING_FAILED", request_id)
    finally:
        await file.close()
        if temp_directory is not None and not queued_cleanup:
            cleanup_directory(temp_directory)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, _error: RequestValidationError) -> JSONResponse:
    return error_body("INVALID_INPUT", uuid.uuid4().hex)


@app.exception_handler(Exception)
async def unhandled_error(_request: Request, _error: Exception) -> JSONResponse:
    return error_body("PROCESSING_FAILED", uuid.uuid4().hex)
