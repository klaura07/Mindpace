"""Transparent, conservative study rules. Signals describe attempts, not people."""
from statistics import median


def response_history(conn, user_id, document_id=None, mode=None):
    return [dict(row) for row in conn.execute(
        """SELECT r.*, q.topic, q.difficulty, q.document_id,
                  COALESCE(q.parent_question_id, q.question_id) AS root_id
           FROM responses r JOIN sessions s ON s.session_id = r.session_id
           JOIN questions q ON q.question_id = r.question_id
           WHERE s.user_id = ? AND (? IS NULL OR q.document_id = ?)
             AND (? IS NULL OR r.response_mode = ?)
           ORDER BY r.response_id DESC LIMIT 200""",
        (user_id, document_id, document_id, mode, mode),
    )]


def signals(history):
    """Use recent comparable attempts; never treat slower reading alone as weakness."""
    recent = history[:30]
    if not recent:
        return {"attempts": 0, "accuracy": None, "confidence": None,
                "calibration_gap": None, "median_response_ms": None,
                "target_difficulty": 1, "state": "Getting started",
                "reason": "Start with a foundation question while we learn your pace.",
                "suggest_break": False, "pace": "Not enough timing data"}
    latest = recent[0]
    baseline = [r["response_time_ms"] for r in history[1:]
                if r["response_time_ms"] is not None and r["response_time_ms"] > 0
                and r["difficulty"] == latest["difficulty"]
                and r["response_mode"] == latest["response_mode"]][:20]
    typical = median(baseline) if len(baseline) >= 5 else None
    elapsed = latest["response_time_ms"]
    fast = typical is not None and elapsed is not None and elapsed < typical * .5
    slow = typical is not None and elapsed is not None and elapsed > typical * 1.8
    correct = bool(latest["is_correct"])
    confident = latest["confidence"] >= .7
    difficulty = max(1, min(3, latest["difficulty"]))
    if not correct and confident:
        state, reason = "Check this concept", "A confident miss moves this concept forward for review."
    elif not correct and fast:
        state, reason = "Take another look", "This miss was quicker than your usual pace. Try a foundation question."
    elif not correct:
        state, reason = "Build the foundation", "A missed answer brings easier practice and an earlier review."
    elif not confident:
        state, reason = "Build confidence", "You got it right with some uncertainty. Stay at this level and revisit it soon."
    else:
        state, reason = "Steady progress", "Keep practicing at this level to check understanding across questions."
    if not correct:
        difficulty = max(1, difficulty - 1)
    elif len(recent) >= 3 and all(r["is_correct"] and r["confidence"] >= .7 for r in recent[:3]):
        difficulty = min(3, difficulty + 1)
        reason = "Three confident correct attempts make a harder question the next priority."
    accuracy = sum(r["is_correct"] for r in recent) / len(recent)
    confidence = sum(r["confidence"] for r in recent) / len(recent)
    times = [r["response_time_ms"] for r in recent if r["response_time_ms"] is not None]
    return {"attempts": len(recent), "accuracy": accuracy, "confidence": confidence,
            "calibration_gap": confidence - accuracy,
            "median_response_ms": median(times) if times else None,
            "target_difficulty": difficulty, "state": state, "reason": reason,
            "suggest_break": len(recent) >= 3 and all(
                not r["is_correct"] and r.get("session_id") == latest.get("session_id")
                for r in recent[:3]),
            "pace": "Quicker than usual" if fast else "Longer than usual" if slow else
                    "Around your usual pace" if typical is not None else "Learning your pace"}


def choose_question(questions, history, due_ids, target):
    latest = {}
    for row in history:
        latest.setdefault(row["root_id"], row)

    def priority(q):
        previous = latest.get(q["question_id"])
        # Due items and confident mistakes first, then difficulty fit; unseen wins ties.
        need = 0 if q["question_id"] in due_ids else 1 if previous and not previous["is_correct"] else 2
        uncertainty = 0 if previous and previous["confidence"] < .7 else 1
        return (need, abs(q["difficulty"] - target), uncertainty,
                0 if previous is None else 1, q["question_id"])

    return min(questions, key=priority) if questions else None
