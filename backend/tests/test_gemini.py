import io
import json
import urllib.error
from unittest.mock import MagicMock, patch

import pytest

import app.gemini as gemini


@pytest.fixture(autouse=True)
def skip_retry_wait(monkeypatch):
    monkeypatch.setattr(gemini.time, "sleep", MagicMock())


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


def _http_error(status):
    return urllib.error.HTTPError(
        "https://example.com", status, "upstream error", None, io.BytesIO(b"{}")
    )


def test_transient_failure_recovers_with_same_schema(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    body = {"candidates": [{"content": {"parts": [{"text": "[]"}]}}]}
    with patch("urllib.request.urlopen", side_effect=[_http_error(503), _mock_response(body)]) as send:
        assert gemini._call_gemini("hi", gemini.QUESTION_RESPONSE_SCHEMA) == "[]"
    assert send.call_count == 2
    requests = [call.args[0] for call in send.call_args_list]
    assert requests[0].data == requests[1].data
    assert requests[0].full_url == requests[1].full_url
    assert "fake-key" not in requests[0].full_url
    gemini.time.sleep.assert_called_once_with(1)


def test_persistent_overload_uses_fallback(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    monkeypatch.setattr(gemini, "GEMINI_FALLBACK_MODEL", "gemini-3.5-flash")
    body = {"candidates": [{"content": {"parts": [{"text": "recovered"}]}}]}
    with patch("urllib.request.urlopen", side_effect=[_http_error(503), _http_error(503), _mock_response(body)]) as send:
        assert gemini._call_gemini("hi") == "recovered"
    assert "gemini-3.5-flash:generateContent" in send.call_args.args[0].full_url
    assert gemini.time.sleep.call_count == 2


def test_retry_limit(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    with patch("urllib.request.urlopen", side_effect=[_http_error(503) for _ in range(3)]) as send:
        with pytest.raises(RuntimeError, match="temporarily unavailable"):
            gemini._call_gemini("hi")
    assert send.call_count == 3


@pytest.mark.parametrize("status", [400, 401, 403, 404, 429])
def test_permanent_errors_are_not_retried(monkeypatch, status):
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    with patch("urllib.request.urlopen", side_effect=_http_error(status)) as send:
        with pytest.raises(RuntimeError):
            gemini._call_gemini("hi")
    assert send.call_count == 1
    gemini.time.sleep.assert_not_called()
