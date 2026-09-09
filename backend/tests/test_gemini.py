import io
import json
import urllib.error
from unittest.mock import MagicMock, patch

import pytest

import app.gemini as gemini


def _mock_response(body: dict):
    response = MagicMock()
    response.read.return_value = json.dumps(body).encode("utf-8")
    response.__enter__.return_value = response
    response.__exit__.return_value = False
    return response


def test_call_gemini_missing_api_key(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="GOOGLE_API_KEY"):
        gemini._call_gemini("hi")


def test_call_gemini_success(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    body = {"candidates": [{"content": {"parts": [{"text": "hello there"}]}}]}
    with patch("urllib.request.urlopen", return_value=_mock_response(body)):
        assert gemini._call_gemini("hi") == "hello there"


def test_call_gemini_timeout_raises_runtime_error(monkeypatch):
    """
    A read timeout on an already-open connection raises a bare TimeoutError
    (not urllib.error.URLError) — this must still surface as a RuntimeError,
    the same as every other Gemini failure mode, not escape uncaught.
    """
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    with patch("urllib.request.urlopen", side_effect=TimeoutError("The read operation timed out")):
        with pytest.raises(RuntimeError, match="timed out"):
            gemini._call_gemini("hi")


def test_call_gemini_http_error_429_is_sanitized(monkeypatch):
    """
    Gemini's actual 429 body is a large, technical JSON blob (quota details,
    doc links, retry-after nesting). Callers must get a short, clean message
    instead of that dumped straight into an end-user-facing error.
    """
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    huge_body = json.dumps({"error": {"code": 429, "message": "quota exceeded" * 50}})
    http_error = urllib.error.HTTPError(
        url="https://example.com",
        code=429,
        msg="Too Many Requests",
        hdrs=None,
        fp=io.BytesIO(huge_body.encode()),
    )
    with patch("urllib.request.urlopen", side_effect=http_error):
        with pytest.raises(RuntimeError) as exc_info:
            gemini._call_gemini("hi")
    assert "quota" in str(exc_info.value).lower()
    assert len(str(exc_info.value)) < 100


def test_call_gemini_http_error(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    http_error = urllib.error.HTTPError(
        url="https://example.com",
        code=503,
        msg="Service Unavailable",
        hdrs=None,
        fp=io.BytesIO(b'{"error": "overloaded"}'),
    )
    with patch("urllib.request.urlopen", side_effect=http_error):
        with pytest.raises(RuntimeError, match="503"):
            gemini._call_gemini("hi")


def test_call_gemini_url_error(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("no route to host")):
        with pytest.raises(RuntimeError, match="unreachable"):
            gemini._call_gemini("hi")


def test_call_gemini_unexpected_response_shape(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    with patch("urllib.request.urlopen", return_value=_mock_response({"unexpected": "shape"})):
        with pytest.raises(RuntimeError, match="Unexpected Gemini response shape"):
            gemini._call_gemini("hi")
