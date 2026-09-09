"""
MindPace API entry point.

FastAPI reads your function type hints to know what JSON shape each
endpoint expects and returns — that's not just for readability, it's
what powers the automatic request validation and the /docs page.
Run this and visit http://127.0.0.1:8000/docs to see it build a live,
clickable API tester out of nothing but this file.
"""
import json
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_connection, init_db
from app.gemini import generate_mcqs, generate_mcqs_from_document, generate_revision_guide
from app.models import (
    CalibrationScoreOut,
    DocumentGenerateResponse,
    DocumentOut,
    QuestionCreate,
    QuestionGenerateRequest,
    QuestionOut,
    ResponseCreate,
    ResponseOut,
    SessionCreate,
    SessionOut,
    UserCreate,
    UserOut,
)
from app.text_extraction import extract_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once when the server starts, before any request is served —
    # guarantees mindpace.db and every table exist ahead of time.
    init_db()
    yield


app = FastAPI(title="MindPace API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Quick check that the server is up and can reach the DB."""
    conn = get_connection()
    conn.execute("SELECT 1")
    conn.close()
    return {"status": "ok"}


@app.post("/users", response_model=UserOut, status_code=201)
def create_user(user: UserCreate):
    conn = get_connection()
    try:
        cursor = conn.execute(
            "INSERT INTO users (email) VALUES (?)", (user.email,)
        )
        conn.commit()
        row = conn.execute(
            "SELECT user_id, email, created_at FROM users WHERE user_id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return dict(row)
    except sqlite3.IntegrityError:
        # UNIQUE constraint on email fired
        raise HTTPException(status_code=409, detail="Email already registered")
    finally:
        conn.close()


@app.get("/users", response_model=UserOut)
def get_user_by_email(email: str):
    conn = get_connection()
    row = conn.execute(
        "SELECT user_id, email, created_at FROM users WHERE email = ?",
        (email,),
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@app.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT user_id, email, created_at FROM users WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


def _row_to_question(row) -> dict:
    data = dict(row)
    data["options"] = json.loads(data["options"]) if data["options"] else None
    return data


@app.post("/questions", response_model=QuestionOut, status_code=201)
def create_question(question: QuestionCreate):
    conn = get_connection()
    try:
        cursor = conn.execute(
            """INSERT INTO questions
               (topic, prompt_text, reference_answer, question_type,
                options, correct_answer, difficulty, parent_question_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                question.topic,
                question.prompt_text,
                question.reference_answer,
                question.question_type,
                json.dumps(question.options) if question.options is not None else None,
                question.correct_answer,
                question.difficulty,
                question.parent_question_id,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM questions WHERE question_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return _row_to_question(row)
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@app.post("/questions/generate", response_model=list[QuestionOut], status_code=201)
def generate_questions(request: QuestionGenerateRequest):
    try:
        generated = generate_mcqs(request.topic, request.count)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    conn = get_connection()
    try:
        created = []
        for q in generated:
            cursor = conn.execute(
                """INSERT INTO questions
                   (topic, prompt_text, question_type, options, correct_answer, difficulty)
                   VALUES (?, ?, 'mcq', ?, ?, ?)""",
                (
                    request.topic,
                    q["prompt_text"],
                    json.dumps(q["options"]),
                    q["correct_answer"],
                    q["difficulty"],
                ),
            )
            row = conn.execute(
                "SELECT * FROM questions WHERE question_id = ?", (cursor.lastrowid,)
            ).fetchone()
            created.append(_row_to_question(row))
        conn.commit()
        return created
    except (sqlite3.IntegrityError, KeyError) as e:
        conn.rollback()
        raise HTTPException(status_code=502, detail=f"Malformed question from Gemini: {e}")
    finally:
        conn.close()


@app.get("/questions/{question_id}", response_model=QuestionOut)
def get_question(question_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM questions WHERE question_id = ?", (question_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return _row_to_question(row)


@app.get("/questions", response_model=list[QuestionOut])
def list_questions(topic: str | None = None):
    conn = get_connection()
    if topic is not None:
        rows = conn.execute(
            "SELECT * FROM questions WHERE topic = ? ORDER BY question_id", (topic,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM questions ORDER BY question_id").fetchall()
    conn.close()
    return [_row_to_question(row) for row in rows]


@app.post("/responses", response_model=ResponseOut, status_code=201)
def create_response(response: ResponseCreate):
    conn = get_connection()
    try:
        question = conn.execute(
            "SELECT correct_answer FROM questions WHERE question_id = ?",
            (response.question_id,),
        ).fetchone()
        if question is None:
            raise HTTPException(status_code=404, detail="Question not found")

        is_correct = int(
            question["correct_answer"] is not None
            and response.answer_text is not None
            and response.answer_text.strip().lower()
            == question["correct_answer"].strip().lower()
        )

        cursor = conn.execute(
            """INSERT INTO responses
               (session_id, question_id, answer_text, is_correct,
                confidence, response_time_ms)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                response.session_id,
                response.question_id,
                response.answer_text,
                is_correct,
                response.confidence,
                response.response_time_ms,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM responses WHERE response_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(row)
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@app.get("/responses/{response_id}", response_model=ResponseOut)
def get_response(response_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM responses WHERE response_id = ?", (response_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Response not found")
    return dict(row)


@app.post("/sessions", response_model=SessionOut, status_code=201)
def create_session(session: SessionCreate):
    conn = get_connection()
    try:
        cursor = conn.execute(
            "INSERT INTO sessions (user_id) VALUES (?)", (session.user_id,)
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(row)
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@app.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return dict(row)


@app.post("/sessions/{session_id}/end", response_model=SessionOut)
def end_session(session_id: int):
    conn = get_connection()
    try:
        cursor = conn.execute(
            "UPDATE sessions SET end_time = datetime('now') WHERE session_id = ?",
            (session_id,),
        )
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found")
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.post("/calibration/{user_id}/compute", response_model=CalibrationScoreOut, status_code=201)
def compute_calibration(user_id: int):
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT 1 FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        stats = conn.execute(
            """SELECT AVG(r.confidence) AS avg_confidence, AVG(r.is_correct) AS accuracy
               FROM responses r
               JOIN sessions s ON s.session_id = r.session_id
               WHERE s.user_id = ?""",
            (user_id,),
        ).fetchone()

        if stats["avg_confidence"] is None:
            raise HTTPException(
                status_code=400, detail="User has no responses to calibrate"
            )

        calibration_gap = stats["avg_confidence"] - stats["accuracy"]

        cursor = conn.execute(
            "INSERT INTO calibration_scores (user_id, calibration_gap) VALUES (?, ?)",
            (user_id, calibration_gap),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM calibration_scores WHERE score_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/calibration/{user_id}", response_model=CalibrationScoreOut)
def get_latest_calibration(user_id: int):
    conn = get_connection()
    row = conn.execute(
        """SELECT * FROM calibration_scores
           WHERE user_id = ? ORDER BY computed_at DESC, score_id DESC LIMIT 1""",
        (user_id,),
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="No calibration score found")
    return dict(row)


@app.post("/documents", response_model=DocumentOut, status_code=201)
async def upload_document(user_id: int, file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = extract_text(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT 1 FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        cursor = conn.execute(
            """INSERT INTO documents (user_id, filename, extracted_text)
               VALUES (?, ?, ?)""",
            (user_id, file.filename, text),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM documents WHERE document_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/documents/{document_id}", response_model=DocumentOut)
def get_document(document_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM documents WHERE document_id = ?", (document_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return dict(row)


@app.get("/documents", response_model=list[DocumentOut])
def list_documents(user_id: int):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM documents WHERE user_id = ? ORDER BY document_id",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/documents/{document_id}/generate", response_model=DocumentGenerateResponse, status_code=201)
def generate_from_document(document_id: int):
    conn = get_connection()
    try:
        document = conn.execute(
            "SELECT * FROM documents WHERE document_id = ?", (document_id,)
        ).fetchone()
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if not document["extracted_text"]:
            raise HTTPException(
                status_code=400, detail="Document has no extracted text to generate from"
            )

        document_text = document["extracted_text"]
        topic = document["filename"].rsplit(".", 1)[0]

        try:
            revision_guide = generate_revision_guide(document_text)
            generated = generate_mcqs_from_document(document_text, count=5)
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e))

        created = []
        for q in generated:
            cursor = conn.execute(
                """INSERT INTO questions
                   (topic, prompt_text, question_type, options, correct_answer, difficulty)
                   VALUES (?, ?, 'mcq', ?, ?, ?)""",
                (
                    topic,
                    q["prompt_text"],
                    json.dumps(q["options"]),
                    q["correct_answer"],
                    q["difficulty"],
                ),
            )
            row = conn.execute(
                "SELECT * FROM questions WHERE question_id = ?", (cursor.lastrowid,)
            ).fetchone()
            created.append(_row_to_question(row))
        conn.commit()

        return {"revision_guide": revision_guide, "questions": created}
    except (sqlite3.IntegrityError, KeyError) as e:
        conn.rollback()
        raise HTTPException(status_code=502, detail=f"Malformed question from Gemini: {e}")
    finally:
        conn.close()
