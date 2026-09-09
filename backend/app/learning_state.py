"""
Classifies a single response into a learning-state label from its
confidence, correctness, and response time. Computed on read — nothing
here is persisted, so the rule can change without a migration.
"""

CONFIDENCE_THRESHOLD = 0.7  # >= this is "high confidence"
FAST_RESPONSE_THRESHOLD_MS = 10_000  # <= this counts as a "fast" answer


def classify_learning_state(
    confidence: float, is_correct: bool, response_time_ms: int | None
) -> str:
    high_confidence = confidence >= CONFIDENCE_THRESHOLD
    fast = response_time_ms is not None and response_time_ms <= FAST_RESPONSE_THRESHOLD_MS
    slow = response_time_ms is not None and response_time_ms > FAST_RESPONSE_THRESHOLD_MS

    if high_confidence and is_correct and fast:
        return "solid grasp"
    if high_confidence and not is_correct:
        return "overconfident"
    if not high_confidence and is_correct:
        return "uncertain but capable"
    if not high_confidence and not is_correct and fast:
        return "guessing"
    if slow and not is_correct:
        return "struggling"

    # Doesn't match any rule as given (e.g. high confidence + correct + slow,
    # or missing response_time_ms on a case that needs fast/slow to decide).
    return "mixed"
