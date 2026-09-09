-- MindPace database schema (SQLite)
-- Translated from the ER diagram: USERS, SESSIONS, QUESTIONS,
-- RESPONSES, CALIBRATION_SCORES, COGNITIVE_STATE_LOGS

PRAGMA foreign_keys = ON;

-- USERS: one row per learner
CREATE TABLE IF NOT EXISTS users (
    user_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SESSIONS: one row per study session a user runs
-- USERS (1) --REGISTERS--> (M) SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    session_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    start_time  TEXT NOT NULL DEFAULT (datetime('now')),
    end_time    TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- QUESTIONS: reusable question bank (seeded or LLM-generated).
-- parent_question_id links a rephrased variant back to its original —
-- this is what makes "dynamic rephrasing" (Bjork / desirable difficulty) queryable later.
CREATE TABLE IF NOT EXISTS questions (
    question_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    topic                TEXT NOT NULL,
    prompt_text          TEXT NOT NULL,
    reference_answer     TEXT,
    question_type        TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'descriptive')),
    options              TEXT,   -- JSON array of answer choices, as TEXT (e.g. '["A","B","C"]')
    correct_answer       TEXT,
    difficulty           INTEGER DEFAULT 1,
    parent_question_id   INTEGER,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_question_id) REFERENCES questions(question_id) ON DELETE SET NULL
);

-- RESPONSES: one row per answer, tied to a session AND a question.
-- SESSIONS (1) --LOGS--> (M) RESPONSES
-- QUESTIONS (1) --APPEARS_IN--> (M) RESPONSES
CREATE TABLE IF NOT EXISTS responses (
    response_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          INTEGER NOT NULL,
    question_id         INTEGER NOT NULL,
    answer_text         TEXT,
    is_correct          INTEGER NOT NULL,        -- 0/1 (SQLite has no native boolean)
    confidence           REAL NOT NULL,           -- 0.0-1.0, from the confidence slider
    response_time_ms    INTEGER,
    answered_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE RESTRICT
);

-- CALIBRATION_SCORES: rolled-up confidence-vs-accuracy metric per user
-- USERS (1) --ACCUMULATES--> (M) CALIBRATION_SCORES
CREATE TABLE IF NOT EXISTS calibration_scores (
    score_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL,
    calibration_gap    REAL NOT NULL,   -- avg(confidence) - accuracy, signed
    computed_at         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- COGNITIVE_STATE_LOGS: fatigue engine's output over the course of a session
-- SESSIONS (1) --GENERATES--> (M) COGNITIVE_STATE_LOGS
CREATE TABLE IF NOT EXISTS cognitive_state_logs (
    log_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL,
    state_label   TEXT NOT NULL CHECK (state_label IN ('flow', 'neutral', 'fatigued')),
    state_score   REAL,     -- optional continuous score behind the label
    logged_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- SOCRATIC_PROBES: the LLM's targeted follow-up when confidence and
-- correctness don't match, plus the user's reply to it.
-- RESPONSES (1) --TRIGGERS--> (M) SOCRATIC_PROBES
CREATE TABLE IF NOT EXISTS socratic_probes (
    probe_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id      INTEGER NOT NULL,
    probe_text       TEXT NOT NULL,
    user_reply_text  TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (response_id) REFERENCES responses(response_id) ON DELETE CASCADE
);

-- JOURNAL_ENTRIES: optional post-session reflection prompt (stretch feature)
-- SESSIONS (1) --HAS--> (M) JOURNAL_ENTRIES
CREATE TABLE IF NOT EXISTS journal_entries (
    entry_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        INTEGER NOT NULL,
    entry_text        TEXT NOT NULL,
    detected_theme    TEXT,     -- filled in later by theme analysis, nullable for now
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- DOCUMENTS: uploaded files (PDF/docx/txt) with extracted text
-- USERS (1) --UPLOADS--> (M) DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
    document_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    filename         TEXT NOT NULL,
    extracted_text   TEXT,
    uploaded_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Indexes: the fatigue engine and calibration engine will query by these
-- join columns on almost every request, so index them up front.
CREATE INDEX IF NOT EXISTS idx_responses_session ON responses(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_question ON responses(question_id);
CREATE INDEX IF NOT EXISTS idx_state_logs_session ON cognitive_state_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_calibration_user ON calibration_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_probes_response ON socratic_probes(response_id);
CREATE INDEX IF NOT EXISTS idx_journal_session ON journal_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
