"""Benchmark the four DoMyFile Render processing routes over HTTP.

This intentionally uses only the Python standard library so it can run from a
clean workstation. The first request is the startup/cold-start sample when it
is run immediately after a Render Free instance wakes; later samples measure
warm reliability.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"
ORIGIN = "https://domyfile.web.id"


def multipart(fields: dict[str, str], file_path: Path, mime: str) -> tuple[bytes, str]:
    boundary = f"----DoMyFileBenchmark{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            ]
        )
    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="file"; filename="input"\r\n',
            f"Content-Type: {mime}\r\n\r\n".encode(),
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return b"".join(chunks), boundary


def make_benchmark_docx(path: Path) -> None:
    paragraphs = "".join(
        f"<w:p><w:pPr><w:keepNext/></w:pPr><w:r><w:t>{escape(text)}</w:t></w:r></w:p>"
        for text in (
            "DoMyFile Render benchmark document",
            "This document contains selectable text, headings, and a small table.",
            "The native conversion should preserve a useful document structure.",
        )
    )
    table = (
        "<w:tbl><w:tblPr><w:tblW w:w=\"9000\" w:type=\"dxa\"/></w:tblPr>"
        "<w:tr><w:tc><w:p><w:r><w:t>Measure</w:t></w:r></w:p></w:tc>"
        "<w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>"
        "<w:tr><w:tc><w:p><w:r><w:t>Processing mode</w:t></w:r></w:p></w:tc>"
        "<w:tc><w:p><w:r><w:t>Short-lived native job</w:t></w:r></w:p></w:tc></w:tr>"
        "</w:tbl>"
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{paragraphs}{table}<w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/>"
        "<w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/>"
        "</w:sectPr></w:body></w:document>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '</Types>'
    )
    relationships = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '</Relationships>'
    )
    document_relationships = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>'
        '</w:styles>'
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("word/document.xml", document)
        archive.writestr("word/_rels/document.xml.rels", document_relationships)
        archive.writestr("word/styles.xml", styles)


def call(base_url: str, spec: dict[str, str], path: Path) -> dict[str, object]:
    body, boundary = multipart(spec, path, spec["inputMime"])
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/v1/process",
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Origin": ORIGIN,
        },
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=360) as response:
            payload = response.read()
            headers = response.headers
            return {
                "status": response.status,
                "ok": True,
                "totalMs": round((time.perf_counter() - started) * 1000, 2),
                "backendMs": headers.get("X-DoMyFile-Backend-Ms"),
                "processorMs": headers.get("X-DoMyFile-Processor-Ms"),
                "inputBytes": headers.get("X-DoMyFile-Input-Bytes"),
                "outputBytes": headers.get("X-DoMyFile-Output-Bytes"),
                "savingsPercent": headers.get("X-DoMyFile-Savings-Percent"),
                "requestId": headers.get("X-DoMyFile-Request-Id"),
                "downloadBytes": len(payload),
            }
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except json.JSONDecodeError:
            detail = {"message": raw[:300]}
        return {
            "status": error.code,
            "ok": False,
            "totalMs": round((time.perf_counter() - started) * 1000, 2),
            "error": detail,
        }
    except (OSError, urllib.error.URLError) as error:
        return {
            "status": None,
            "ok": False,
            "totalMs": round((time.perf_counter() - started) * 1000, 2),
            "error": str(error),
        }


def health(base_url: str) -> dict[str, object]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(f"{base_url.rstrip('/')}/health", timeout=120) as response:
            return {
                "status": response.status,
                "ok": True,
                "totalMs": round((time.perf_counter() - started) * 1000, 2),
                "body": json.loads(response.read()),
            }
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        return {"status": None, "ok": False, "totalMs": round((time.perf_counter() - started) * 1000, 2), "error": str(error)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("RENDER_BACKEND_URL"), help="Render service URL")
    parser.add_argument("--repeats", type=int, default=3, help="Requests per tool, including the first sample")
    args = parser.parse_args()
    if not args.url:
        parser.error("set RENDER_BACKEND_URL or pass --url")
    if args.repeats < 1 or args.repeats > 10:
        parser.error("--repeats must be between 1 and 10")

    with tempfile.TemporaryDirectory(prefix="domyfile-benchmark-") as temporary:
        docx_path = Path(temporary) / "benchmark.docx"
        make_benchmark_docx(docx_path)
        jobs = [
            (
                "compress-pdf",
                {"toolId": "PDF-01", "inputMime": "application/pdf", "preset": "balanced"},
                FIXTURES / "compress-mixed-content.pdf",
            ),
            (
                "docx-to-pdf",
                {"toolId": "DOC-04", "inputMime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "preset": "balanced"},
                docx_path,
            ),
            (
                "pdf-to-docx",
                {"toolId": "DOC-05", "inputMime": "application/pdf", "preset": "balanced"},
                FIXTURES / "multi-page.pdf",
            ),
            (
                "compress-video",
                {"toolId": "VID-01", "inputMime": "video/mp4", "preset": "balanced"},
                FIXTURES / "video" / "trim-mp4-h264-aac.mp4",
            ),
        ]
        report: dict[str, object] = {"url": args.url.rstrip("/"), "health": health(args.url), "tools": {}}
        for name, spec, path in jobs:
            samples = [call(args.url, spec, path) for _ in range(args.repeats)]
            report["tools"][name] = {"input": str(path), "inputBytes": path.stat().st_size, "samples": samples}
        print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
