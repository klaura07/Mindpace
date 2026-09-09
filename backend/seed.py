"""
Seeds the database with demo users, sessions, responses, documents, and
journal entries so the dashboard (calibration gap, calibration trend,
learning-state labels), document library, and journal history all look
meaningful during a live demo instead of empty or trivial.

Safe to re-run: each demo user is identified by a fixed email. On every
run, that user (and everything that cascades from them — sessions,
responses, calibration_scores, documents, journal_entries) is deleted
first, then recreated fresh from the definitions below. The shared
question bank (both the quiz bank and the documents' "generated"
questions) is looked up by (topic, prompt_text) before inserting, so
re-running never duplicates it and never trips the FK that protects
questions still referenced by other responses.

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

# Each answer is (question_index into DEMO_QUESTIONS, is_correct, confidence,
# response_time_ms). Timings and confidence are deliberately spread across
# the learning-state classifier's thresholds (confidence >= 0.7 is "high",
# response_time_ms <= 10000 is "fast") so the demo surfaces every label at
# least once, not just one or two repeated ones.
DEMO_USERS = [
    {
        "email": "priya.nair88@gmail.com",
        # Overconfident: high confidence, wrong more often than not.
        "sessions": [
            [(0, True, 0.90, 2000), (1, False, 0.85, 2500), (2, False, 0.95, 30000), (3, True, 0.90, 1800)],
            [(4, False, 0.80, 3000), (5, False, 0.90, 4000), (6, True, 0.85, 2200)],
            [(7, False, 0.95, 5000), (0, False, 0.90, 45000), (3, True, 0.85, 2000)],
        ],
        "journal_entries": [
            "I was so sure about the Sahara answer but blanked on the actual continent.",
            "Ran out of time on the last question and just guessed.",
        ],
        "documents": [
            {
                "filename": "cellular_respiration.txt",
                "extracted_text": (
                    "Cellular respiration is the process cells use to convert glucose and "
                    "oxygen into usable energy (ATP), carbon dioxide, and water. It has three "
                    "main stages: glycolysis (in the cytoplasm, splits glucose into pyruvate), "
                    "the citric acid cycle (in the mitochondrial matrix, generates electron "
                    "carriers), and oxidative phosphorylation (in the inner mitochondrial "
                    "membrane, uses the electron transport chain to produce most of the ATP). "
                    "The overall equation is: C6H12O6 + 6O2 -> 6CO2 + 6H2O + ATP."
                ),
                "generated_questions": [
                    {
                        "prompt_text": "Where in the cell does glycolysis take place?",
                        "options": ["Cytoplasm", "Mitochondrial matrix", "Inner mitochondrial membrane", "Nucleus"],
                        "correct_answer": "Cytoplasm",
                        "difficulty": 1,
                    },
                    {
                        "prompt_text": "Which stage of cellular respiration produces the most ATP?",
                        "options": ["Glycolysis", "Citric acid cycle", "Oxidative phosphorylation", "Fermentation"],
                        "correct_answer": "Oxidative phosphorylation",
                        "difficulty": 2,
                    },
                ],
            },
        ],
    },
    {
        "email": "marcus.chen@outlook.com",
        # Underconfident: low confidence, right more often than not.
        "sessions": [
            [(0, True, 0.30, 12000), (1, True, 0.35, 9000), (2, False, 0.30, 3000), (3, True, 0.40, 15000)],
            [(4, True, 0.25, 8000), (5, False, 0.30, 20000), (6, True, 0.45, 6000)],
            [(7, True, 0.35, 11000), (0, False, 0.20, 2000), (1, True, 0.30, 7000)],
        ],
        "journal_entries": [
            "I actually second-guessed a correct answer on the science question.",
        ],
        "documents": [
            {
                "filename": "newtons_laws.txt",
                "extracted_text": (
                    "Newton's three laws of motion describe the relationship between a body and "
                    "the forces acting upon it. The first law states that an object at rest stays "
                    "at rest, and an object in motion stays in motion, unless acted upon by an "
                    "external force. The second law states that force equals mass times "
                    "acceleration (F = ma). The third law states that for every action there is "
                    "an equal and opposite reaction."
                ),
                "generated_questions": [
                    {
                        "prompt_text": "According to Newton's second law, what is the formula for force?",
                        "options": ["F = ma", "F = mv", "F = m/a", "F = a/m"],
                        "correct_answer": "F = ma",
                        "difficulty": 1,
                    },
                    {
                        "prompt_text": "Newton's first law is also known as the law of what?",
                        "options": ["Gravity", "Inertia", "Momentum", "Acceleration"],
                        "correct_answer": "Inertia",
                        "difficulty": 2,
                    },
                ],
            },
        ],
    },
    {
        "email": "sofia.almeida@yahoo.com",
        # Well-calibrated: confidence roughly tracks accuracy.
        "sessions": [
            [(0, True, 0.75, 3000), (1, False, 0.40, 25000), (2, True, 0.80, 2500), (3, False, 0.30, 4000)],
            [(4, True, 0.70, 6000), (5, False, 0.35, 3000), (6, True, 0.75, 9000)],
            [(7, False, 0.45, 18000), (0, True, 0.80, 25000), (3, True, 0.65, 5000)],
        ],
        "journal_entries": [
            "Mixed up which president came first — Adams or Washington.",
            "I read the river question too fast and picked the first option I recognized.",
        ],
        "documents": [
            {
                "filename": "french_revolution_summary.txt",
                "extracted_text": (
                    "The French Revolution (1789-1799) overthrew the French monarchy and "
                    "reshaped French politics and society. It began with the storming of the "
                    "Bastille in July 1789 and led to the Declaration of the Rights of Man, the "
                    "execution of King Louis XVI in 1793, the Reign of Terror under Robespierre, "
                    "and eventually the rise of Napoleon Bonaparte, who took power in 1799."
                ),
                "generated_questions": [
                    {
                        "prompt_text": "What event is traditionally seen as the start of the French Revolution?",
                        "options": [
                            "The storming of the Bastille",
                            "The execution of Louis XVI",
                            "The rise of Napoleon",
                            "The Reign of Terror",
                        ],
                        "correct_answer": "The storming of the Bastille",
                        "difficulty": 1,
                    },
                    {
                        "prompt_text": "Who led the Reign of Terror during the French Revolution?",
                        "options": ["Napoleon Bonaparte", "Louis XVI", "Robespierre", "Marie Antoinette"],
                        "correct_answer": "Robespierre",
                        "difficulty": 2,
                    },
                ],
            },
            {
                "filename": "cell_biology_mitosis_meiosis.txt",
                "extracted_text": (
                    "Mitosis produces two genetically identical diploid daughter cells and is "
                    "used for growth and tissue repair. Meiosis produces four genetically unique "
                    "haploid cells (gametes) through two rounds of division, and is used for "
                    "sexual reproduction. Meiosis includes a crossing-over step during prophase I "
                    "that mixes genetic material between homologous chromosomes, which is the "
                    "main source of genetic variation between siblings."
                ),
                "generated_questions": [
                    {
                        "prompt_text": "How many daughter cells does mitosis produce?",
                        "options": ["2", "4", "1", "8"],
                        "correct_answer": "2",
                        "difficulty": 1,
                    },
                    {
                        "prompt_text": "What process during meiosis mixes genetic material between homologous chromosomes?",
                        "options": ["Crossing-over", "Cytokinesis", "Replication", "Fertilization"],
                        "correct_answer": "Crossing-over",
                        "difficulty": 2,
                    },
                ],
            },
        ],
    },
]


def reset_demo_user(conn, email):
    """
    Deletes the demo user (if present) so this run starts clean. Every
    table that hangs off a user or session (sessions, responses,
    calibration_scores, documents, journal_entries, cognitive_state_logs)
    is declared ON DELETE CASCADE in schema.sql, so one delete clears all
    of it. The shared question bank is untouched — questions are only
    ON DELETE RESTRICT'd from their own deletion, never cascaded into.
    """
    conn.execute("DELETE FROM users WHERE email = ?", (email,))


def get_or_create_user(conn, email):
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


def seed_session(conn, user_id, question_ids, answers):
    """Inserts one session and its responses; returns the session_id."""
    session_id = conn.execute(
        "INSERT INTO sessions (user_id) VALUES (?)", (user_id,)
    ).lastrowid

    for question_index, is_correct, confidence, response_time_ms in answers:
        question_id = question_ids[question_index]
        question = conn.execute(
            "SELECT correct_answer, options FROM questions WHERE question_id = ?",
            (question_id,),
        ).fetchone()
        options = json.loads(question["options"])
        answer_text = (
            question["correct_answer"]
            if is_correct
            else next(opt for opt in options if opt != question["correct_answer"])
        )
        conn.execute(
            """INSERT INTO responses
               (session_id, question_id, answer_text, is_correct,
                confidence, response_time_ms)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (session_id, question_id, answer_text, int(is_correct), confidence, response_time_ms),
        )

    conn.execute(
        "UPDATE sessions SET end_time = datetime('now') WHERE session_id = ?",
        (session_id,),
    )
    return session_id


def compute_calibration(conn, user_id):
    """
    Mirrors POST /calibration/{user_id}/compute: avg(confidence) minus
    accuracy, over the user's full response history to date. Called after
    each seeded session so the trend has one point per session, the same
    way it would if a real user completed several quiz sessions over time.
    """
    stats = conn.execute(
        """SELECT AVG(r.confidence) AS avg_confidence, AVG(r.is_correct) AS accuracy
           FROM responses r
           JOIN sessions s ON s.session_id = r.session_id
           WHERE s.user_id = ?""",
        (user_id,),
    ).fetchone()
    calibration_gap = stats["avg_confidence"] - stats["accuracy"]
    conn.execute(
        "INSERT INTO calibration_scores (user_id, calibration_gap) VALUES (?, ?)",
        (user_id, calibration_gap),
    )


def seed_documents(conn, user_id, documents):
    for doc in documents:
        document_id = conn.execute(
            "INSERT INTO documents (user_id, filename, extracted_text) VALUES (?, ?, ?)",
            (user_id, doc["filename"], doc["extracted_text"]),
        ).lastrowid

        topic = doc["filename"].rsplit(".", 1)[0]
        for q in doc["generated_questions"]:
            get_or_create_question(
                conn,
                {
                    "topic": topic,
                    "prompt_text": q["prompt_text"],
                    "options": q["options"],
                    "correct_answer": q["correct_answer"],
                    "difficulty": q["difficulty"],
                },
            )
        print(f"  document_id={document_id} ({doc['filename']}) "
              f"with {len(doc['generated_questions'])} generated questions")


def seed_journal_entries(conn, session_id, entries):
    # detected_theme would normally come from Gemini (see classify_theme in
    # app/gemini.py); seeding a plausible canned theme keeps this script
    # offline and deterministic rather than depending on a live API call.
    for entry_text in entries:
        theme = entry_text[:40].rstrip(".") + ("…" if len(entry_text) > 40 else "")
        conn.execute(
            """INSERT INTO journal_entries (session_id, entry_text, detected_theme)
               VALUES (?, ?, ?)""",
            (session_id, entry_text, theme),
        )


def seed():
    init_db()
    conn = get_connection()
    try:
        question_ids = [get_or_create_question(conn, q) for q in DEMO_QUESTIONS]

        for demo_user in DEMO_USERS:
            email = demo_user["email"]
            reset_demo_user(conn, email)
            user_id = get_or_create_user(conn, email)

            session_ids = []
            for answers in demo_user["sessions"]:
                session_id = seed_session(conn, user_id, question_ids, answers)
                session_ids.append(session_id)
                compute_calibration(conn, user_id)

            seed_journal_entries(conn, session_ids[-1], demo_user["journal_entries"])
            seed_documents(conn, user_id, demo_user["documents"])

            total_responses = sum(len(a) for a in demo_user["sessions"])
            print(
                f"Seeded user_id={user_id} ({email}): "
                f"{len(session_ids)} sessions, {total_responses} responses, "
                f"{len(demo_user['journal_entries'])} journal entries, "
                f"{len(demo_user['documents'])} documents"
            )

        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    seed()
