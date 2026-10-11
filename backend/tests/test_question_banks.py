from contextlib import closing
from unittest.mock import Mock

import pytest

from app import database, main
from test_auth import client, signup


def bank():
    return [{"prompt_text": f"Recall concept {i}?", "options": ["A", "B", "C", "D"],
             "correct_answer": "A", "explanation": "The governing principle makes A correct; the other choices confuse cause with effect.", "difficulty": difficulty}
            for i, difficulty in enumerate([1, 1, 2, 2, 3])]


def test_topic_bank_is_saved_reused_and_practised(client, monkeypatch):
    user = signup(client).json()["user_id"]
    generate = Mock(return_value=bank())
    monkeypatch.setattr(main, "generate_mcqs", generate)
    first = client.post("/questions/generate", json={"topic": "  AI data centres  "})
    assert first.status_code == 201, first.text
    questions = first.json()
    assert len(questions) == 5
    assert client.post("/questions/generate", json={"topic": "AI data centres"}).json() == questions
    generate.assert_called_once_with("AI data centres", 5)
    database.init_db()
    assert client.get("/question-topics").json() == [{"topic": "AI data centres", "question_count": 5}]
    assert client.get("/topic-questions", params={"topic": "AI data centres"}).json() == questions

    for mode in ("question",):
        session = client.post("/sessions", json={"user_id": user}).json()["session_id"]
        params = {"topic": "AI data centres", "session_id": session, "mode": mode}
        seen = set()
        for _ in questions:
            result = client.get("/study-topic/next", params=params)
            assert result.status_code == 200, result.text
            question = result.json()["question"]
            assert "correct_answer" not in question
            assert "explanation" not in question
            assert question["question_id"] not in seen
            seen.add(question["question_id"])
            response = client.post("/responses", json={"session_id": session,
                "question_id": question["question_id"], "answer_text": "B",
                "response_mode": mode,
                "confidence": .4, "response_time_ms": 1200})
            assert response.status_code == 201, response.text
            assert response.json()["adaptation"]["attempts"] == len(seen)
        assert client.get("/study-topic/next", params=params).json()["question"] is None
        client.post(f"/sessions/{session}/end")
        assert client.get("/study-topic/next", params=params).status_code == 409
    analytics = client.get(f"/analytics/{user}").json()
    assert analytics["question"]["overall"]["accuracy"] == 0
    assert "flashcard" not in analytics
    with closing(database.get_connection()) as conn:
        assert conn.execute("SELECT COUNT(*) FROM review_items").fetchone()[0] == 5


def test_topic_history_and_ownership_are_isolated(client, monkeypatch):
    user = signup(client).json()["user_id"]
    monkeypatch.setattr(main, "generate_mcqs", lambda *args: bank())
    for topic in ("Plants", "Databases"):
        client.post("/questions/generate", json={"topic": topic})
    session = client.post("/sessions", json={"user_id": user}).json()["session_id"]
    question = client.get("/study-topic/next", params={"topic": "Plants", "session_id": session}).json()["question"]
    client.post("/responses", json={"session_id": session, "question_id": question["question_id"], "answer_text": "B", "confidence": .9})
    result = client.get("/study-topic/next", params={"topic": "Databases", "session_id": session}).json()
    assert result["adaptation"]["attempts"] == 0
    client.post("/auth/logout")
    other = signup(client, "other@example.com").json()["user_id"]
    other_session = client.post("/sessions", json={"user_id": other}).json()["session_id"]
    assert client.get("/question-topics").json() == []
    assert client.get("/topic-questions", params={"topic": "Plants"}).json() == []
    assert client.get("/study-topic/next", params={"topic": "Plants", "session_id": session}).status_code == 404
    assert client.get("/study-topic/next", params={"topic": "Plants", "session_id": other_session}).status_code == 404


@pytest.mark.parametrize("payload", [{"topic": " "}, {"topic": "x" * 201}, {"topic": "Plants", "count": 0}, {"topic": "Plants", "count": 21}])
def test_invalid_topic_does_not_call_gemini(client, monkeypatch, payload):
    signup(client)
    generate = Mock()
    monkeypatch.setattr(main, "generate_mcqs", generate)
    assert client.post("/questions/generate", json=payload).status_code == 422
    generate.assert_not_called()


@pytest.mark.parametrize("invalid", [[], {}, [None], [{"prompt_text": "Missing fields"}],
    [{**bank()[0], "options": ["A", "A", "B", "C"]}],
    [{**bank()[0], "correct_answer": "E"}], [{**bank()[0], "difficulty": 4}],
    [bank()[0], {**bank()[1], "prompt_text": " "}]])
def test_bad_generation_is_atomic_for_topics_and_documents(client, monkeypatch, invalid):
    user = signup(client).json()["user_id"]
    doc = client.post(f"/documents?user_id={user}", files={"file": ("notes.txt", b"Study facts")}).json()["document_id"]
    monkeypatch.setattr(main, "generate_mcqs", lambda *args: invalid)
    monkeypatch.setattr(main, "generate_mcqs_from_document", lambda *args, **kwargs: invalid)
    assert client.post("/questions/generate", json={"topic": "Plants"}).status_code == 502
    assert client.post(f"/documents/{doc}/generate").status_code == 502
    assert client.get("/question-topics").json() == []
    assert client.get(f"/documents/{doc}/questions").json() == []


def test_document_generation_reuses_bank_and_empty_upload_is_rejected(client, monkeypatch):
    user = signup(client).json()["user_id"]
    assert client.post(f"/documents?user_id={user}", files={"file": ("empty.txt", b"  ")}).status_code == 400
    assert client.get(f"/documents?user_id={user}").json() == []
    doc = client.post(f"/documents?user_id={user}", files={"file": ("notes.txt", b"Study facts")}).json()["document_id"]
    generate = Mock(return_value=bank())
    monkeypatch.setattr(main, "generate_mcqs_from_document", generate)
    questions = client.post(f"/documents/{doc}/generate").json()
    assert client.post(f"/documents/{doc}/generate").json() == questions
    generate.assert_called_once()
    assert client.get(f"/documents?user_id={user}").json()[0]["question_count"] == 5


def test_topic_can_be_saved_without_generation_and_is_private(client, monkeypatch):
    signup(client)
    generate = Mock(side_effect=RuntimeError("Gemini unavailable"))
    monkeypatch.setattr(main, "generate_mcqs", generate)
    for _ in range(2):
        result = client.post("/study-topics", json={"topic": "  Systems thinking  "})
        assert result.status_code == 201
        assert result.json()["topic"] == "Systems thinking"
    assert client.get("/question-topics").json() == [{"topic": "Systems thinking", "question_count": 0}]
    assert client.post("/study-topics", json={"topic": " "}).status_code == 422
    generate.assert_not_called()
    client.post("/auth/logout")
    signup(client, "another@example.com")
    assert client.get("/question-topics").json() == []


def test_conceptual_upgrade_preserves_previous_answers(client, monkeypatch):
    user = signup(client).json()["user_id"]
    old = client.post("/questions", json={"topic": "Plants", **bank()[0]}).json()
    session = client.post("/sessions", json={"user_id": user}).json()["session_id"]
    response = client.post("/responses", json={"session_id": session,
        "question_id": old["question_id"], "answer_text": "B", "confidence": .9}).json()
    monkeypatch.setattr(main, "generate_mcqs", Mock(return_value=bank()))
    upgraded = client.post("/questions/generate", json={"topic": "Plants"})
    assert upgraded.status_code == 201, upgraded.text
    assert old["question_id"] not in {q["question_id"] for q in upgraded.json()}
    assert client.get(f"/responses/{response['response_id']}").json()["question_id"] == old["question_id"]
    assert len(client.get("/topic-questions", params={"topic": "Plants"}).json()) == 5
    with closing(database.get_connection()) as conn:
        assert conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0] == 6
        assert conn.execute("SELECT is_active FROM questions WHERE question_id = ?", (old["question_id"],)).fetchone()[0] == 0


def test_explanation_is_required_before_storing_generated_questions(client, monkeypatch):
    signup(client)
    incomplete = bank()
    incomplete[0].pop("explanation")
    monkeypatch.setattr(main, "generate_mcqs", lambda *args: incomplete)
    assert client.post("/questions/generate", json={"topic": "Plants"}).status_code == 502
    assert client.get("/topic-questions", params={"topic": "Plants"}).json() == []


@pytest.mark.parametrize("generated", [False, True])
def test_remove_concept_persists_and_can_be_restored(client, monkeypatch, generated):
    user = signup(client).json()["user_id"]
    generate = Mock(return_value=bank())
    monkeypatch.setattr(main, "generate_mcqs", generate)
    topic = "Energy / water & cooling?"
    if generated:
        questions = client.post("/questions/generate", json={"topic": topic}).json()
        session = client.post("/sessions", json={"user_id": user}).json()["session_id"]
        answer = client.post("/responses", json={"session_id": session,
            "question_id": questions[0]["question_id"], "answer_text": "A", "confidence": .8}).json()
    else:
        client.post("/study-topics", json={"topic": topic})
    client.post("/study-topics", json={"topic": "Keep this"})
    for _ in range(2):
        assert client.request("DELETE", "/study-topics", json={"topic": topic}).status_code == 204
    database.init_db()
    assert client.get("/question-topics").json() == [{"topic": "Keep this", "question_count": 0}]
    if generated:
        assert client.get(f"/responses/{answer['response_id']}").json()["question_id"] == questions[0]["question_id"]
        assert client.get("/topic-questions", params={"topic": topic}).json() == questions
    client.post("/study-topics", json={"topic": topic})
    assert {item["topic"] for item in client.get("/question-topics").json()} == {topic, "Keep this"}
    assert generate.call_count == int(generated)


def test_concept_removal_is_authenticated_and_user_scoped(client):
    assert client.request("DELETE", "/study-topics", json={"topic": "Plants"}).status_code == 401
    owner = signup(client).json()["user_id"]
    client.post("/study-topics", json={"topic": "Plants"})
    client.post("/auth/logout")
    signup(client, "other-removal@example.com")
    client.post("/study-topics", json={"topic": "Plants"})
    assert client.request("DELETE", "/study-topics", json={"topic": "Plants"}).status_code == 204
    assert client.get("/question-topics").json() == []
    with closing(database.get_connection()) as conn:
        assert conn.execute("SELECT topic FROM study_topics WHERE user_id = ?", (owner,)).fetchone()[0] == "Plants"
        assert conn.execute("SELECT 1 FROM hidden_study_topics WHERE user_id = ?", (owner,)).fetchone() is None
    assert client.request("DELETE", "/study-topics", json={"topic": " "}).status_code == 422
