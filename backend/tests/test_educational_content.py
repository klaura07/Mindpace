import json
from unittest.mock import Mock

import pytest

from app import educational_content as education
from test_auth import client, signup
from test_gemini import _mock_response


def grounded_response():
    statement = "Plants convert light into chemical energy."
    return {"candidates": [{
        "finishReason": "STOP",
        "content": {"parts": [{"text": "EDUCATIONAL NOTES\n" + statement +
            "\nKEY FACTS\nChlorophyll absorbs light.\nIMPORTANT UPDATES\nNo recent change was found."}]},
        "groundingMetadata": {
            "groundingChunks": [{"web": {"uri": "https://example.org/science", "title": "Science source"}}],
            "groundingSupports": [{"segment": {"text": statement}, "groundingChunkIndices": [0]}],
            "searchEntryPoint": {"renderedContent": "<div>Search suggestions</div>"},
        },
    }]}


def test_search_enabled_and_citations_preserved(monkeypatch):
    monkeypatch.setattr(education, "SEARCH_GROUNDING_ENABLED", True)
    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
    send = Mock(return_value=_mock_response(grounded_response()))
    monkeypatch.setattr("urllib.request.urlopen", send)
    result = education.generate_content("Photosynthesis")
    payload = json.loads(send.call_args.args[0].data)
    assert payload["tools"] == [{"google_search": {}}]
    assert "responseMimeType" not in payload.get("generationConfig", {})
    assert "chemical energy. [1]" in result["text"]
    assert result["sources"][0]["url"] == "https://example.org/science"
    assert result["search_suggestions"] == "<div>Search suggestions</div>"


def test_unicode_multipart_and_unsafe_source(monkeypatch):
    monkeypatch.setattr(education, "SEARCH_GROUNDING_ENABLED", True)
    body = grounded_response()
    candidate = body["candidates"][0]
    candidate["content"]["parts"] = [{"text": "private reasoning", "thought": True},
        {"text": "Café ☀ "}, {"text": "A supported fact."}]
    metadata = candidate["groundingMetadata"]
    metadata["groundingChunks"].append({"web": {"uri": "javascript:alert(1)", "title": "unsafe"}})
    metadata["groundingSupports"] = [{"segment": {"text": "A supported fact.", "endIndex": 26},
                                      "groundingChunkIndices": [0, 1, 99]}]
    monkeypatch.setattr(education, "_request_gemini", lambda payload: body)
    result = education.generate_content("Topic")
    assert result["text"] == "Café ☀ A supported fact. [1]"
    assert len(result["sources"]) == 1


@pytest.mark.parametrize("change", ["no_sources", "no_supports", "truncated", "empty", "blocked"])
def test_incomplete_or_unverified_results_are_not_presented_as_current(monkeypatch, change):
    monkeypatch.setattr(education, "SEARCH_GROUNDING_ENABLED", True)
    body = grounded_response()
    candidate = body["candidates"][0]
    if change == "no_sources": candidate["groundingMetadata"]["groundingChunks"] = []
    if change == "no_supports": candidate["groundingMetadata"]["groundingSupports"] = []
    if change == "truncated": candidate["finishReason"] = "MAX_TOKENS"
    if change == "empty": candidate["content"]["parts"] = []
    if change == "blocked": body = {"promptFeedback": {"blockReason": "SAFETY"}}
    monkeypatch.setattr(education, "_request_gemini", lambda payload: body)
    with pytest.raises(RuntimeError):
        education.generate_content("Topic")


@pytest.mark.parametrize("document_text", [None, "Plants use light to make sugars."])
def test_free_notes_do_not_request_search_or_require_citations(monkeypatch, document_text):
    monkeypatch.setattr(education, "SEARCH_GROUNDING_ENABLED", False)
    body = grounded_response()
    del body["candidates"][0]["groundingMetadata"]
    body["candidates"][0]["content"]["parts"] = [{"text": "EDUCATIONAL NOTES\nPlant notes.\nKEY FACTS\nPlants use light."}]
    send = Mock(return_value=body)
    monkeypatch.setattr(education, "_request_gemini", send)
    result = education.generate_content("Plants", document_text)
    payload = send.call_args.args[0]
    assert "tools" not in payload
    assert json.loads(payload["contents"][0]["parts"][0]["text"])["document_text"] == document_text
    assert "no live web access" in payload["systemInstruction"]["parts"][0]["text"]
    assert result["web_verified"] is False
    assert result["sources"] == []
    assert result["search_suggestions"] == ""


@pytest.mark.parametrize("candidate", [
    {"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": "Partial notes"}]}},
    {"content": {"parts": [{"text": " "}]}},
    {},
])
def test_free_notes_reject_incomplete_responses(monkeypatch, candidate):
    monkeypatch.setattr(education, "SEARCH_GROUNDING_ENABLED", False)
    monkeypatch.setattr(education, "_request_gemini", lambda payload: {"candidates": [candidate]})
    with pytest.raises(RuntimeError):
        education.generate_content("Plants")


def test_topic_and_document_paths_use_the_right_material(client, monkeypatch):
    user_id = signup(client).json()["user_id"]
    send = Mock(return_value=grounded_response())
    monkeypatch.setattr(education, "_request_gemini", send)
    result = client.post("/educational-content", json={"topic": "  Photosynthesis  "})
    assert result.status_code == 200
    assert result.json()["title"] == "Photosynthesis"
    source = json.loads(send.call_args.args[0]["contents"][0]["parts"][0]["text"])
    assert source == {"topic": "Photosynthesis", "document_text": None}
    document_id = client.post(f"/documents?user_id={user_id}", files={
        "file": ("plants.txt", b"Document-specific plant material.", "text/plain")
    }).json()["document_id"]
    result = client.post("/educational-content", json={"document_id": document_id})
    assert result.status_code == 200
    source = json.loads(send.call_args.args[0]["contents"][0]["parts"][0]["text"])
    assert source["document_text"] == "Document-specific plant material."
    assert result.json()["title"] == "plants.txt"
    assert client.get(f"/documents/{document_id}/questions").json() == []


@pytest.mark.parametrize("payload", [{}, {"topic": "  "}, {"topic": "a" * 201},
    {"topic": "Plants", "document_id": 1}, {"document_id": 0}])
def test_invalid_input(client, monkeypatch, payload):
    signup(client)
    generate = Mock()
    monkeypatch.setattr(education, "generate_content", generate)
    assert client.post("/educational-content", json=payload).status_code == 422
    generate.assert_not_called()


def test_authentication_document_ownership_and_missing_document(client, monkeypatch):
    generate = Mock()
    monkeypatch.setattr(education, "generate_content", generate)
    assert client.post("/educational-content", json={"topic": "Plants"}).status_code == 401
    user_id = signup(client).json()["user_id"]
    document_id = client.post(f"/documents?user_id={user_id}", files={
        "file": ("private.txt", b"Private notes", "text/plain")
    }).json()["document_id"]
    client.post("/auth/logout")
    signup(client, "other@example.com")
    assert client.post("/educational-content", json={"document_id": document_id}).status_code == 404
    assert client.post("/educational-content", json={"document_id": 99999}).status_code == 404
    generate.assert_not_called()


def test_empty_document_and_upstream_failure(client, monkeypatch):
    user_id = signup(client).json()["user_id"]
    empty_upload = client.post(f"/documents?user_id={user_id}", files={
        "file": ("empty.txt", b"   ", "text/plain")
    })
    assert empty_upload.status_code == 400
    generate = Mock(side_effect=RuntimeError("Gemini is temporarily unavailable"))
    monkeypatch.setattr(education, "generate_content", generate)
    generate.assert_not_called()
    result = client.post("/educational-content", json={"topic": "Plants"})
    assert result.status_code == 502
    assert result.json()["detail"] == "Gemini is temporarily unavailable"
