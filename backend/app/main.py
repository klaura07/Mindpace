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
from statistics import median
from typing import Literal
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.auth import (ALLOWED_ORIGINS, current_user, require_auth, require_owner,
                      require_question_access, require_session_owner, router as auth_router)
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_connection, init_db
from app.gemini import (
    ask_assistant,
    classify_theme,
    generate_mcqs,
    generate_mcqs_from_document,
    generate_question_variant,
)
from app.adaptive import choose_question, response_history, signals
from app.rate_limit import RateLimiter
from app.models import (
    AssistantRequest,
    AssistantResponse,
    CalibrationScoreOut,
    DocumentGenerateResponse,
    DocumentOut,
    JournalEntryCreate,
    JournalEntryOut,
    LearningStateTopicCounts,
    QuestionCreate,
    QuestionGenerateRequest,
    QuestionOut,
    ResponseCreate,
    ResponseOut,
    ReviewItemOut,
    SessionCreate,
    SessionOut,
    UserOut,
)
from app.text_extraction import extract_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once when the server starts, before any request is served —
    # guarantees mindpace.db and every table exist ahead of time.
    init_db()
    yield


app = FastAPI(title="MindPace API", lifespan=lifespan, dependencies=[Depends(require_auth)])
app.include_router(auth_router)


@app.middleware("http")
async def prevent_private_caching(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Never echo submitted passwords in validation responses.
    errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", "X-Mindpace-Request"],
)


@app.get("/health")
def health_check():
    """Quick check that the server is up and can reach the DB."""
    conn = get_connection()
    conn.execute("SELECT 1")
    conn.close()
    return {"status": "ok"}


@app.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
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
def create_question(question: QuestionCreate, user: dict = Depends(current_user)):
    if question.parent_question_id is not None:
        require_question_access(user, question.parent_question_id)
    conn = get_connection()
    try:
        cursor = conn.execute(
            """INSERT INTO questions
               (owner_user_id, topic, prompt_text, reference_answer, question_type,
                options, correct_answer, difficulty, parent_question_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user["user_id"],
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
def generate_questions(request: QuestionGenerateRequest, user: dict = Depends(current_user)):
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
                   (owner_user_id, topic, prompt_text, question_type, options, correct_answer, difficulty)
                   VALUES (?, ?, ?, 'mcq', ?, ?, ?)""",
                (
                    user["user_id"],
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
def get_question(question_id: int, user: dict = Depends(current_user)):
    require_question_access(user, question_id)
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM questions WHERE question_id = ?", (question_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return _row_to_question(row)


@app.get("/questions", response_model=list[QuestionOut])
def list_questions(topic: str | None = None, user: dict = Depends(current_user)):
    conn = get_connection()
    if topic is not None:
        rows = conn.execute(
            "SELECT * FROM questions WHERE topic = ? AND (owner_user_id IS NULL OR owner_user_id = ?) ORDER BY question_id", (topic, user["user_id"])
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM questions WHERE owner_user_id IS NULL OR owner_user_id = ? ORDER BY question_id", (user["user_id"],)).fetchall()
    conn.close()
    return [_row_to_question(row) for row in rows]


@app.post("/questions/{question_id}/reframe", response_model=QuestionOut, status_code=201)
def reframe_question(question_id: int, user: dict = Depends(current_user)):
    """
    Generates and persists a fresh variant of an existing question via
    Gemini — same underlying concept, different wording/options — linked
    back to the original via parent_question_id. Used by the Review
    page's "Review now" action so a due question isn't just repeated
    verbatim.
    """
    require_question_access(user, question_id)
    conn = get_connection()
    try:
        original = conn.execute(
            "SELECT * FROM questions WHERE question_id = ?", (question_id,)
        ).fetchone()
        if original is None:
            raise HTTPException(status_code=404, detail="Question not found")

        original_dict = _row_to_question(original)
        try:
            variant = generate_question_variant(original_dict)
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e))

        cursor = conn.execute(
            """INSERT INTO questions
               (owner_user_id, document_id, topic, prompt_text, question_type, options, correct_answer,
                difficulty, parent_question_id)
               VALUES (?, ?, ?, ?, 'mcq', ?, ?, ?, ?)""",
            (
                user["user_id"],
                original_dict.get("document_id"),
                original_dict["topic"],
                variant["prompt_text"],
                json.dumps(variant["options"]),
                variant["correct_answer"],
                variant["difficulty"],
                question_id,
            ),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM questions WHERE question_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return _row_to_question(row)
    except (sqlite3.IntegrityError, KeyError) as e:
        conn.rollback()
        raise HTTPException(status_code=502, detail=f"Malformed variant from Gemini: {e}")
    finally:
        conn.close()


# Short review intervals for uncertainty or misses; confident successes expand them.
REVIEW_MASTERED_INTERVAL_DAYS = 30


def _schedule_review(conn: sqlite3.Connection, user_id: int, question_id: int, is_correct: bool,
                     confidence: float = 1, response_time_ms: int | None = None,
                     typical_ms: float | None = None) -> None:
    """
    Upserts the (user, question) row in review_items based on the latest
    response. A miss schedules a re-review a few days out; a hit doubles
    the interval (pushing the next review further away), and once the
    interval reaches REVIEW_MASTERED_INTERVAL_DAYS the row is dropped —
    the question is no longer considered "due" at all.
    """
    existing = conn.execute(
        "SELECT * FROM review_items WHERE user_id = ? AND question_id = ?",
        (user_id, question_id),
    ).fetchone()

    needs_review = not is_correct or confidence < .7
    interval = 1 if not is_correct and (confidence >= .7 or
        (typical_ms is not None and response_time_ms is not None and response_time_ms < typical_ms * .5)) else 2
    if needs_review:
        if existing:
            conn.execute(
                """UPDATE review_items
                   SET interval_days = ?,
                       next_review_date = datetime('now', ?),
                       updated_at = datetime('now')
                   WHERE review_item_id = ?""",
                (
                    interval,
                    f"+{interval} days",
                    existing["review_item_id"],
                ),
            )
        else:
            conn.execute(
                """INSERT INTO review_items (user_id, question_id, interval_days, next_review_date)
                   VALUES (?, ?, ?, datetime('now', ?))""",
                (user_id, question_id, interval, f"+{interval} days"),
            )
        return

    # Correct answer: only matters if this question was already flagged
    # weak — a fresh correct answer to a question that was never missed
    # has nothing to clear.
    if not existing:
        return

    new_interval = min(existing["interval_days"] * 2, REVIEW_MASTERED_INTERVAL_DAYS)
    if new_interval >= REVIEW_MASTERED_INTERVAL_DAYS:
        conn.execute(
            "DELETE FROM review_items WHERE review_item_id = ?", (existing["review_item_id"],)
        )
    else:
        conn.execute(
            """UPDATE review_items
               SET interval_days = ?,
                   next_review_date = datetime('now', ?),
                   updated_at = datetime('now')
               WHERE review_item_id = ?""",
            (new_interval, f"+{new_interval} days", existing["review_item_id"]),
        )


@app.post("/responses", response_model=ResponseOut, status_code=201)
def create_response(response: ResponseCreate, user: dict = Depends(current_user)):
    require_session_owner(user, response.session_id)
    require_question_access(user, response.question_id)
    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        question = conn.execute(
            "SELECT * FROM questions WHERE question_id = ?",
            (response.question_id,),
        ).fetchone()
        if question is None:
            raise HTTPException(status_code=404, detail="Question not found")

        session = conn.execute(
            "SELECT user_id, end_time FROM sessions WHERE session_id = ?", (response.session_id,)
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        if session["end_time"]:
            raise HTTPException(status_code=409, detail="This study session has ended. Start another session.")
        existing = conn.execute(
            "SELECT * FROM responses WHERE session_id = ? AND question_id = ?",
            (response.session_id, response.question_id),
        ).fetchone()
        if existing:
            # Network retries must not create duplicate learning evidence.
            if (existing["response_mode"] != response.response_mode or
                    existing["answer_text"] != response.answer_text or
                    existing["confidence"] != response.confidence or
                    (response.response_mode == "flashcard" and existing["is_correct"] != int(response.recalled))):
                raise HTTPException(status_code=409, detail="This question already has a saved answer in this session.")
            return {**dict(existing), "correct_answer": question["correct_answer"],
                    "adaptation": signals(response_history(conn, user["user_id"], question["document_id"], existing["response_mode"]))}

        is_correct = int(
            question["correct_answer"] is not None
            and response.answer_text is not None
            and response.answer_text.strip().lower()
            == question["correct_answer"].strip().lower()
        )
        if response.response_mode == "flashcard":
            is_correct = int(response.recalled)
        history = response_history(conn, user["user_id"], question["document_id"], response.response_mode)
        timings = [r["response_time_ms"] for r in history
                   if r["difficulty"] == question["difficulty"] and r["response_time_ms"]][:20]
        typical_ms = median(timings) if len(timings) >= 5 else None

        cursor = conn.execute(
            """INSERT INTO responses
               (session_id, question_id, answer_text, is_correct,
                confidence, response_time_ms, response_mode)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                response.session_id,
                response.question_id,
                response.answer_text,
                is_correct,
                response.confidence,
                response.response_time_ms,
                response.response_mode,
            ),
        )
        # If this response was to a reframed variant (parent_question_id
        # set), the review schedule tracks the original question — that's
        # what the due list and future reframes key off of.
        review_question_id = question["parent_question_id"] or response.question_id
        _schedule_review(conn, session["user_id"], review_question_id, bool(is_correct),
                         response.confidence, response.response_time_ms, typical_ms)
        conn.commit()
        row = conn.execute(
            "SELECT * FROM responses WHERE response_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return {**dict(row), "correct_answer": question["correct_answer"],
                "adaptation": signals(response_history(conn, user["user_id"], question["document_id"], response.response_mode))}
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@app.get("/responses/{response_id}", response_model=ResponseOut)
def get_response(response_id: int, user: dict = Depends(current_user)):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM responses WHERE response_id = ?", (response_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Response not found")
    require_session_owner(user, row["session_id"])
    return dict(row)


@app.post("/sessions", response_model=SessionOut, status_code=201)
def create_session(session: SessionCreate, user: dict = Depends(current_user)):
    require_owner(user, session.user_id)
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
def get_session(session_id: int, user: dict = Depends(current_user)):
    require_session_owner(user, session_id)
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return dict(row)


@app.post("/sessions/{session_id}/end", response_model=SessionOut)
def end_session(session_id: int, user: dict = Depends(current_user)):
    require_session_owner(user, session_id)
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
def compute_calibration(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
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
               WHERE s.user_id = ? AND r.response_mode = 'question'""",
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
def get_latest_calibration(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
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


@app.get("/calibration/{user_id}/trend", response_model=list[CalibrationScoreOut])
def get_calibration_trend(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM calibration_scores
           WHERE user_id = ? ORDER BY computed_at ASC, score_id ASC""",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/documents", response_model=DocumentOut, status_code=201)
async def upload_document(user_id: int, file: UploadFile = File(...), user: dict = Depends(current_user)):
    require_owner(user, user_id)
    content = await file.read()
    try:
        text = extract_text(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # A wrong/unsupported extension raises ValueError (handled above);
        # a matching extension with corrupt/unreadable content raises
        # library-specific errors (e.g. pypdf's PdfReadError) that would
        # otherwise escape as an unhandled 500.
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

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
def get_document(document_id: int, user: dict = Depends(current_user)):
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM documents WHERE document_id = ?", (document_id,)
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")
    require_owner(user, row["user_id"])
    return dict(row)


@app.get("/documents", response_model=list[DocumentOut])
def list_documents(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM documents WHERE user_id = ? ORDER BY document_id",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.get("/documents/{document_id}/questions", response_model=list[QuestionOut])
def document_questions(document_id: int, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        document = conn.execute(
            "SELECT user_id FROM documents WHERE document_id = ?", (document_id,)
        ).fetchone()
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        require_owner(user, document["user_id"])
        rows = conn.execute(
            "SELECT * FROM questions WHERE document_id = ? AND owner_user_id = ? AND parent_question_id IS NULL ORDER BY question_id",
            (document_id, user["user_id"]),
        ).fetchall()
        return [_row_to_question(row) for row in rows]
    finally:
        conn.close()


@app.post("/documents/{document_id}/generate", response_model=DocumentGenerateResponse, status_code=201)
def generate_from_document(document_id: int, user: dict = Depends(current_user)):
    conn = get_connection()
    try:
        document = conn.execute(
            "SELECT * FROM documents WHERE document_id = ?", (document_id,)
        ).fetchone()
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        require_owner(user, document["user_id"])
        if not document["extracted_text"] or not document["extracted_text"].strip():
            raise HTTPException(
                status_code=400, detail="Document has no extracted text to generate from"
            )

        document_text = document["extracted_text"]
        topic = document["filename"].rsplit(".", 1)[0]

        try:
            generated = generate_mcqs_from_document(document_text, count=5)
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e))

        created = []
        for q in generated:
            cursor = conn.execute(
                """INSERT INTO questions
                   (owner_user_id, document_id, topic, prompt_text, question_type, options, correct_answer, difficulty)
                   VALUES (?, ?, ?, ?, 'mcq', ?, ?, ?)""",
                (
                    user["user_id"],
                    document_id,
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

        return {"questions": created}
    except (sqlite3.IntegrityError, KeyError) as e:
        conn.rollback()
        raise HTTPException(status_code=502, detail=f"Malformed question from Gemini: {e}")
    finally:
        conn.close()


@app.get("/study/{document_id}/next")
def next_study_question(document_id: int, session_id: int,
                        mode: Literal["question", "flashcard"] = "question",
                        user: dict = Depends(current_user)):
    require_session_owner(user, session_id)
    conn = get_connection()
    try:
        document = conn.execute("SELECT * FROM documents WHERE document_id = ?", (document_id,)).fetchone()
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        require_owner(user, document["user_id"])
        session = conn.execute("SELECT end_time FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        if session["end_time"]:
            raise HTTPException(status_code=409, detail="This study session has ended.")
        history = response_history(conn, user["user_id"], document_id, mode)
        profile = signals(history)
        questions = [dict(row) for row in conn.execute(
            """SELECT * FROM questions q WHERE document_id = ? AND owner_user_id = ?
               AND parent_question_id IS NULL AND NOT EXISTS
               (SELECT 1 FROM responses r WHERE r.question_id = q.question_id AND r.session_id = ?)""",
            (document_id, user["user_id"], session_id))]
        due = {row[0] for row in conn.execute(
            "SELECT question_id FROM review_items WHERE user_id = ? AND next_review_date <= datetime('now')",
            (user["user_id"],))}
        selected = choose_question(questions, history, due, profile["target_difficulty"])
        if selected:
            selected = _row_to_question(selected)
            if mode == "question":
                selected.pop("correct_answer", None)
                selected.pop("reference_answer", None)
        return {"question": selected, "remaining": len(questions), "adaptation": profile}
    finally:
        conn.close()


@app.get("/analytics/{user_id}")
def study_analytics(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
    conn = get_connection()
    try:
        # Separate scored answers from self-reported recall, including their pace baselines.
        profiles = {}
        for mode in ("question", "flashcard"):
            history = response_history(conn, user_id, mode=mode)
            topics = {}
            for row in history:
                topics.setdefault((row["document_id"], row["topic"]), []).append(row)
            profiles[mode] = {"overall": signals(history), "topics": [
                {"document_id": doc_id, "topic": topic, **signals(rows)}
                for (doc_id, topic), rows in topics.items()]}
        return profiles
    finally:
        conn.close()


@app.get("/learning-state/{user_id}", response_model=list[LearningStateTopicCounts])
def get_learning_state(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT 1 FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        rows = response_history(conn, user_id, mode="question")
        counts_by_topic: dict[str, dict[str, int]] = {}
        for index, row in enumerate(rows):
            comparable = [r for r in rows[index:] if r["document_id"] == row["document_id"] and r["topic"] == row["topic"]]
            label = signals(comparable)["state"]
            topic_counts = counts_by_topic.setdefault(row["topic"], {})
            topic_counts[label] = topic_counts.get(label, 0) + 1

        return [
            {"topic": topic, "counts": topic_counts}
            for topic, topic_counts in counts_by_topic.items()
        ]
    finally:
        conn.close()


@app.get("/review/{user_id}", response_model=list[ReviewItemOut])
def get_due_review_items(user_id: int, user: dict = Depends(current_user)):
    """
    Questions due for review right now (next_review_date <= now),
    prioritized so the user's weakest topics — lowest accuracy so far —
    surface first, then earliest-due within a topic.
    """
    require_owner(user, user_id)
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT 1 FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        due_rows = conn.execute(
            """SELECT ri.next_review_date, q.question_id, q.topic, q.prompt_text,
                      q.question_type, q.options, q.correct_answer, q.difficulty
               FROM review_items ri
               JOIN questions q ON q.question_id = ri.question_id
               WHERE ri.user_id = ? AND ri.next_review_date <= datetime('now')""",
            (user_id,),
        ).fetchall()

        accuracy_rows = conn.execute(
            """SELECT q.topic, AVG(r.is_correct) AS accuracy
               FROM responses r
               JOIN sessions s ON s.session_id = r.session_id
               JOIN questions q ON q.question_id = r.question_id
               WHERE s.user_id = ?
               GROUP BY q.topic""",
            (user_id,),
        ).fetchall()
        accuracy_by_topic = {row["topic"]: row["accuracy"] for row in accuracy_rows}

        due = [_row_to_question(row) for row in due_rows]
        due.sort(key=lambda item: (accuracy_by_topic.get(item["topic"], 0.0), item["next_review_date"]))
        return due
    finally:
        conn.close()


@app.post("/journal-entries", response_model=JournalEntryOut, status_code=201)
def create_journal_entry(entry: JournalEntryCreate, user: dict = Depends(current_user)):
    require_session_owner(user, entry.session_id)
    if not entry.entry_text.strip():
        raise HTTPException(status_code=400, detail="entry_text cannot be empty")

    conn = get_connection()
    try:
        session = conn.execute(
            "SELECT 1 FROM sessions WHERE session_id = ?", (entry.session_id,)
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        try:
            detected_theme = classify_theme(entry.entry_text)
        except RuntimeError as e:
            raise HTTPException(status_code=502, detail=str(e))

        cursor = conn.execute(
            """INSERT INTO journal_entries (session_id, entry_text, detected_theme)
               VALUES (?, ?, ?)""",
            (entry.session_id, entry.entry_text, detected_theme),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM journal_entries WHERE entry_id = ?", (cursor.lastrowid,)
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/journal-entries", response_model=list[JournalEntryOut])
def list_journal_entries(user_id: int, user: dict = Depends(current_user)):
    require_owner(user, user_id)
    conn = get_connection()
    rows = conn.execute(
        """SELECT j.* FROM journal_entries j
           JOIN sessions s ON s.session_id = j.session_id
           WHERE s.user_id = ?
           ORDER BY j.entry_id""",
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


ASSISTANT_RATE_LIMIT = RateLimiter(max_requests=10, window_seconds=60)


@app.post("/assistant", response_model=AssistantResponse)
def ask_assistant_endpoint(request: AssistantRequest, http_request: Request, user: dict = Depends(current_user)):
    if request.session_id is not None:
        require_session_owner(user, request.session_id)
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")

    client_key = http_request.client.host if http_request.client else "unknown"
    allowed, retry_after = ASSISTANT_RATE_LIMIT.check(client_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests to the assistant — please wait a moment and try again.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )

    topic = None
    signals = None
    if request.session_id is not None:
        conn = get_connection()
        # Best-effort context: the topic of the most recent question answered
        # in this session, if any, plus recent behavioral signals (confidence,
        # correctness, response time) to give Zen something to react to. A
        # Session ownership was checked before reading any context.
        row = conn.execute(
            """SELECT q.topic FROM responses r
               JOIN questions q ON q.question_id = r.question_id
               WHERE r.session_id = ?
               ORDER BY r.response_id DESC LIMIT 1""",
            (request.session_id,),
        ).fetchone()
        topic = row["topic"] if row else None

        recent = conn.execute(
            """SELECT confidence, is_correct, response_time_ms FROM responses
               WHERE session_id = ? ORDER BY response_id DESC LIMIT 5""",
            (request.session_id,),
        ).fetchall()
        conn.close()

        if recent:
            confidences = [r["confidence"] for r in recent]
            response_times = [r["response_time_ms"] for r in recent if r["response_time_ms"] is not None]
            signals = {
                "avg_confidence": sum(confidences) / len(confidences),
                "accuracy": sum(r["is_correct"] for r in recent) / len(recent),
                "avg_response_time_ms": (
                    sum(response_times) / len(response_times) if response_times else None
                ),
                # Oldest to newest, matching the order Zen should narrate it in.
                "recent_pattern": [bool(r["is_correct"]) for r in reversed(recent)],
            }

    try:
        reply = ask_assistant(request.message, topic=topic, signals=signals)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"reply": reply}
