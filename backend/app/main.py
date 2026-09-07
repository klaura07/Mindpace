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

from fastapi import FastAPI, HTTPException

from app.database import get_connection, init_db
from app.models import QuestionCreate, QuestionOut, UserCreate, UserOut


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once when the server starts, before any request is served —
    # guarantees mindpace.db and every table exist ahead of time.
    init_db()
    yield


app = FastAPI(title="MindPace API", lifespan=lifespan)


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
