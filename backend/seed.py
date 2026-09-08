"""
Seeds the database with demo users, questions, sessions, and responses so
the dashboard/calibration numbers look meaningful during a live demo
instead of empty or trivial.

Safe to re-run: users are looked up by email (create-if-missing), and
demo questions are looked up by (topic, prompt_text) before inserting.
Each run still adds a fresh session + responses for every demo user, so
running it multiple times will keep shifting their calibration numbers
based on the newly appended responses.

Usage: python seed.py
"""
import json

from app.database import get_connection, init_db

DEMO_QUESTIONS = [
    {
        "topic": "geography",
        "prompt_text": "What is the capital of France?",
        "options": ["Paris", "Lyon", "Marseille", "Nice"],
        "correct_answer": "Paris",
        "difficulty": 1,
    },
    {
        "topic": "geography",
        "prompt_text": "Which continent is the Sahara Desert located on?",
        "options": ["Asia", "Africa", "Australia", "South America"],
        "correct_answer": "Africa",
        "difficulty": 1,
    },
    {
        "topic": "geography",
        "prompt_text": "What is the longest river in the world?",
        "options": ["Amazon", "Nile", "Yangtze", "Mississippi"],
        "correct_answer": "Nile",
        "difficulty": 2,
    },
    {
        "topic": "science",
        "prompt_text": "What planet is known as the Red Planet?",
        "options": ["Venus", "Mars", "Jupiter", "Saturn"],
        "correct_answer": "Mars",
        "difficulty": 1,
    },
    {
        "topic": "science",
        "prompt_text": "What gas do plants absorb from the atmosphere?",
        "options": ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
        "correct_answer": "Carbon dioxide",
        "difficulty": 1,
    },
    {
        "topic": "science",
        "prompt_text": "What is the chemical symbol for gold?",
        "options": ["Go", "Gd", "Au", "Ag"],
        "correct_answer": "Au",
        "difficulty": 2,
    },
    {
        "topic": "history",
        "prompt_text": "In which year did World War II end?",
        "options": ["1943", "1945", "1947", "1950"],
        "correct_answer": "1945",
        "difficulty": 2,
    },
    {
        "topic": "history",
        "prompt_text": "Who was the first President of the United States?",
        "options": ["Thomas Jefferson", "John Adams", "George Washington", "James Madison"],
        "correct_answer": "George Washington",
        "difficulty": 1,
    },
]

# Each demo user has a distinct calibration profile: a list of
# (answer_is_correct, confidence) pairs, one per question they'll answer.
DEMO_USERS = [
    {
        "email": "demo-overconfident@mindpace.dev",
        # High confidence but wrong more often than not — positive gap.
        "answers": [
            (True, 0.9), (False, 0.85), (False, 0.95), (True, 0.9),
            (False, 0.8), (False, 0.9), (True, 0.85), (False, 0.95),
        ],
    },
    {
        "email": "demo-underconfident@mindpace.dev",
        # Low confidence but right most of the time — negative gap.
        "answers": [
            (True, 0.3), (True, 0.4), (True, 0.2), (False, 0.35),
            (True, 0.3), (True, 0.45), (True, 0.25), (True, 0.35),
        ],
    },
    {
        "email": "demo-calibrated@mindpace.dev",
        # Confidence roughly tracks actual accuracy — gap near zero.
        "answers": [
            (True, 0.7), (False, 0.4), (True, 0.75), (True, 0.65),
            (False, 0.3), (True, 0.8), (False, 0.45), (True, 0.7),
        ],
    },
]


def get_or_create_user(conn, email):
    row = conn.execute("SELECT user_id FROM users WHERE email = ?", (email,)).fetchone()
    if row:
        return row["user_id"]
    cursor = conn.execute("INSERT INTO users (email) VALUES (?)", (email,))
    return cursor.lastrowid


def get_or_create_question(conn, q):
    row = conn.execute(
        "SELECT question_id FROM questions WHERE topic = ? AND prompt_text = ?",
        (q["topic"], q["prompt_text"]),
    ).fetchone()
    if row:
        return row["question_id"]
    cursor = conn.execute(
        """INSERT INTO questions
           (topic, prompt_text, question_type, options, correct_answer, difficulty)
           VALUES (?, ?, 'mcq', ?, ?, ?)""",
        (
            q["topic"],
            q["prompt_text"],
            json.dumps(q["options"]),
            q["correct_answer"],
            q["difficulty"],
        ),
    )
    return cursor.lastrowid


def seed():
    init_db()
    conn = get_connection()
    try:
        question_ids = [get_or_create_question(conn, q) for q in DEMO_QUESTIONS]

        for demo_user in DEMO_USERS:
            user_id = get_or_create_user(conn, demo_user["email"])
            session_cursor = conn.execute(
                "INSERT INTO sessions (user_id) VALUES (?)", (user_id,)
            )
            session_id = session_cursor.lastrowid

            for (question_id, (is_correct, confidence)) in zip(
                question_ids, demo_user["answers"]
            ):
                question = conn.execute(
                    "SELECT correct_answer, options FROM questions WHERE question_id = ?",
                    (question_id,),
                ).fetchone()
                options = json.loads(question["options"])
                if is_correct:
                    answer_text = question["correct_answer"]
                else:
                    answer_text = next(
                        opt for opt in options if opt != question["correct_answer"]
                    )

                conn.execute(
                    """INSERT INTO responses
                       (session_id, question_id, answer_text, is_correct,
                        confidence, response_time_ms)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        session_id,
                        question_id,
                        answer_text,
                        int(is_correct),
                        confidence,
                        1500,
                    ),
                )

            conn.execute(
                "UPDATE sessions SET end_time = datetime('now') WHERE session_id = ?",
                (session_id,),
            )
            print(f"Seeded user_id={user_id} ({demo_user['email']}) "
                  f"session_id={session_id} with {len(demo_user['answers'])} responses")

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    seed()
