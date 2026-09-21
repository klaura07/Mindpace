import pytest
from contextlib import closing
from app import database, main
from app.adaptive import signals, choose_question
from test_auth import client, signup


def setup_study(client, monkeypatch):
    user = signup(client).json()['user_id']
    doc = client.post(f'/documents?user_id={user}', files={'file': ('source.txt', b'Learning material')}).json()['document_id']
    monkeypatch.setattr(main, 'generate_mcqs_from_document', lambda *args, **kwargs: [
        {'prompt_text': f'Question {i}?', 'options': ['A', 'B', 'C', 'D'], 'correct_answer': 'A', 'difficulty': difficulty}
        for i, difficulty in enumerate([1, 1, 2, 2, 3])
    ])
    generated = client.post(f'/documents/{doc}/generate')
    assert generated.status_code == 201, generated.text
    assert set(generated.json()) == {'questions'}
    session = client.post('/sessions', json={'user_id': user}).json()['session_id']
    return user, doc, session, generated.json()['questions']


def test_adaptive_flow_retry_and_exhaustion(client, monkeypatch):
    user, doc, session, bank = setup_study(client, monkeypatch)
    url = f'/study/{doc}/next?session_id={session}'
    first = client.get(url).json()
    assert first['question']['difficulty'] == 1
    assert 'correct_answer' not in first['question']
    payload = {'session_id': session, 'question_id': first['question']['question_id'],
               'answer_text': 'B', 'confidence': .9, 'response_time_ms': 3000}
    answer = client.post('/responses', json=payload)
    assert answer.status_code == 201, answer.text
    assert answer.json()['adaptation']['state'] == 'Check this concept'
    assert answer.json()['correct_answer'] == 'A'
    assert client.post('/responses', json=payload).json()['response_id'] == answer.json()['response_id']
    assert client.post('/responses', json={**payload, 'answer_text': 'A'}).status_code == 409
    second = client.get(url).json()
    assert second['remaining'] == 4
    assert second['question']['question_id'] != first['question']['question_id']
    assert second['question']['difficulty'] == 1
    with closing(database.get_connection()) as conn:
        assert conn.execute('SELECT COUNT(*) FROM responses').fetchone()[0] == 1
        assert conn.execute('SELECT interval_days FROM review_items').fetchone()[0] == 1
    for _ in range(4):
        q = client.get(url).json()['question']
        response = client.post('/responses', json={**payload, 'question_id': q['question_id'], 'answer_text': 'A'})
        assert response.status_code == 201
    assert client.get(url).json()['question'] is None
    assert client.get(f'/analytics/{user}').json()['question']['overall']['attempts'] == 5
    client.post(f'/sessions/{session}/end')
    assert client.get(url).status_code == 409
    assert client.post('/responses', json=payload).status_code == 409


def test_flashcard_recall_is_separate_and_uncertainty_schedules_review(client, monkeypatch):
    user, doc, session, bank = setup_study(client, monkeypatch)
    card = client.get(f'/study/{doc}/next?session_id={session}&mode=flashcard').json()['question']
    assert card['correct_answer'] == 'A'
    result = client.post('/responses', json={'session_id': session, 'question_id': card['question_id'],
        'response_mode': 'flashcard', 'recalled': True, 'confidence': .3, 'response_time_ms': 15000})
    assert result.status_code == 201, result.text
    assert result.json()['is_correct'] == 1
    analytics = client.get(f'/analytics/{user}').json()
    assert analytics['question']['overall']['attempts'] == 0
    assert analytics['flashcard']['overall']['accuracy'] == 1
    assert analytics['flashcard']['overall']['median_response_ms'] == 15000
    assert client.post(f'/calibration/{user}/compute').status_code == 400
    with closing(database.get_connection()) as conn:
        assert conn.execute('SELECT interval_days FROM review_items').fetchone()[0] == 2


@pytest.mark.parametrize('patch', [
    {'confidence': -1}, {'confidence': 1.1}, {'response_time_ms': -1},
    {'response_time_ms': 90000000}, {'response_mode': 'unknown'},
    {'response_mode': 'flashcard'}, {'answer_text': '   '},
])
def test_invalid_learning_signals_rejected(client, monkeypatch, patch):
    _, _, session, bank = setup_study(client, monkeypatch)
    payload = {'session_id': session, 'question_id': bank[0]['question_id'], 'confidence': .5, 'answer_text': 'A'}
    assert client.post('/responses', json={**payload, **patch}).status_code == 422


def test_study_and_analytics_require_ownership(client, monkeypatch):
    user, doc, session, _ = setup_study(client, monkeypatch)
    other = signup(client, 'other@example.com').json()['user_id']
    other_session = client.post('/sessions', json={'user_id': other}).json()['session_id']
    assert client.get(f'/analytics/{user}').status_code == 404
    assert client.get(f'/study/{doc}/next?session_id={session}').status_code == 404
    assert client.get(f'/study/{doc}/next?session_id={other_session}').status_code == 404


def attempt(correct=True, confidence=.9, ms=20000, difficulty=2, mode='question'):
    return {'is_correct': correct, 'confidence': confidence, 'response_time_ms': ms,
            'difficulty': difficulty, 'response_mode': mode, 'root_id': 1}


def test_personal_pace_requires_comparable_history_and_never_punishes_slow_correct():
    baseline = [attempt() for _ in range(5)]
    quick_miss = attempt(False, .4, 2000)
    assert signals([quick_miss] + baseline)['state'] == 'Take another look'
    assert signals([quick_miss] + baseline[:4])['pace'] == 'Learning your pace'
    assert signals([quick_miss] + [attempt(mode='flashcard') for _ in range(5)])['pace'] == 'Learning your pace'
    assert signals([quick_miss] + [attempt(difficulty=1) for _ in range(5)])['pace'] == 'Learning your pace'
    slow = signals([attempt(ms=90000)] + baseline)
    assert slow['pace'] == 'Longer than usual'
    assert slow['target_difficulty'] == 3
    assert not slow['suggest_break']
    assert signals([attempt(False)] * 3)['suggest_break']
    assert not signals([{**attempt(False), 'session_id': i} for i in range(3)])['suggest_break']
    assert signals([attempt(confidence=.3)] * 3)['target_difficulty'] == 2
    assert signals([])['accuracy'] is None


def test_due_and_missed_material_take_priority():
    bank = [{'question_id': 1, 'difficulty': 1}, {'question_id': 2, 'difficulty': 3}]
    assert choose_question(bank, [], {2}, 1)['question_id'] == 2
    assert choose_question(bank, [{**attempt(False), 'root_id': 2}], set(), 1)['question_id'] == 2
    assert choose_question([], [], set(), 1) is None


def test_review_variants_keep_document_context(client, monkeypatch):
    user, doc, session, bank = setup_study(client, monkeypatch)
    monkeypatch.setattr(main, 'generate_question_variant', lambda q: {**q, 'prompt_text': 'Variant?'})
    variant = client.post(f"/questions/{bank[0]['question_id']}/reframe")
    assert variant.status_code == 201, variant.text
    response = client.post('/responses', json={'session_id': session, 'question_id': variant.json()['question_id'],
        'answer_text': 'A', 'confidence': .4, 'response_time_ms': 45000})
    assert response.status_code == 201, response.text
    analytics = client.get(f'/analytics/{user}').json()
    assert analytics['question']['topics'][0]['document_id'] == doc
    assert len(client.get(f'/documents/{doc}/questions').json()) == 5


def test_response_mode_migration_preserves_existing_answers(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'old-study.db')
    schema = database.SCHEMA_PATH.read_text(encoding='utf-8')
    schema = '\n'.join(line for line in schema.splitlines() if 'response_mode' not in line)
    with closing(database.get_connection()) as conn, conn:
        conn.executescript(schema)
        conn.execute("INSERT INTO users (email) VALUES ('old@example.com')")
        conn.execute("INSERT INTO sessions (user_id) VALUES (1)")
        conn.execute("INSERT INTO questions (topic, prompt_text) VALUES ('Old', 'Existing question')")
        conn.execute("INSERT INTO responses (session_id, question_id, answer_text, is_correct, confidence) VALUES (1, 1, 'A', 1, .9)")
    database.init_db()
    database.init_db()
    with closing(database.get_connection()) as conn:
        saved = dict(conn.execute('SELECT * FROM responses').fetchone())
        assert saved['response_mode'] == 'question'
        assert saved['answer_text'] == 'A'
        assert saved['confidence'] == .9
