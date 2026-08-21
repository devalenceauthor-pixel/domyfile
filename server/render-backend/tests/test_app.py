from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app  # noqa: E402


FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures"


def test_health_and_allowlist() -> None:
    with TestClient(app.app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["tools"] == ["DOC-04", "DOC-05", "PDF-01", "VID-01"]


def test_pdf_process_returns_result_and_cleans_after_response() -> None:
    with TestClient(app.app) as client:
        with (FIXTURES / "compress-image-heavy.pdf").open("rb") as source:
            response = client.post(
                "/v1/process",
                data={"toolId": "PDF-01", "inputMime": "application/pdf", "preset": "balanced"},
                files={"file": ("input", source, "application/pdf")},
                headers={"Origin": "https://domyfile.web.id"},
            )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://domyfile.web.id"
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF-")
    assert int(response.headers["x-domyfile-output-bytes"]) == len(response.content)
    assert response.headers["content-disposition"].endswith('filename="compressed-document.pdf"')
    assert not list(app.TEMP_ROOT.glob(f"{app.TEMP_PREFIX}*"))


def test_other_origin_is_not_allowed() -> None:
    with TestClient(app.app) as client:
        with (FIXTURES / "compress-image-heavy.pdf").open("rb") as source:
            response = client.post(
                "/v1/process",
                data={"toolId": "PDF-01", "inputMime": "application/pdf", "preset": "balanced"},
                files={"file": ("input", source, "application/pdf")},
                headers={"Origin": "https://evil.example"},
            )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight_is_limited_to_domyfile() -> None:
    with TestClient(app.app) as client:
        allowed = client.options(
            "/v1/process",
            headers={
                "Origin": "https://domyfile.web.id",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        denied = client.options(
            "/v1/process",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://domyfile.web.id"
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_invalid_tool_is_rejected_before_processing() -> None:
    with TestClient(app.app) as client:
        response = client.post(
            "/v1/process",
            data={"toolId": "IMG-12", "inputMime": "image/jpeg", "preset": "balanced"},
            files={"file": ("input", b"not-an-image", "image/jpeg")},
        )

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_INPUT"
