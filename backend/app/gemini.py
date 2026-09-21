"""
Thin wrapper around the Gemini API for MCQ generation.

Uses urllib (stdlib) instead of pulling in a new HTTP client dependency —
this is a single JSON POST, no need for an SDK.
"""
import json
import os
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv()

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash").strip()
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash").strip()
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)

QUESTION_RESPONSE_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "prompt_text": {"type": "STRING"},
            "options": {"type": "ARRAY", "items": {"type": "STRING"}},
            "correct_answer": {"type": "STRING"},
            "difficulty": {"type": "INTEGER"},
        },
        "required": ["prompt_text", "options", "correct_answer", "difficulty"],
    },
}


def _call_gemini(prompt: str, response_schema: dict | None = None) -> str:
    """
    Posts a single prompt to Gemini and returns the raw text of the reply.
    If `response_schema` is given, asks Gemini to return JSON matching it
    (the caller is then responsible for json.loads-ing the result).
    Raises RuntimeError on any API or parsing failure.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")

    generation_config = {}
    if response_schema is not None:
        generation_config = {
            "responseMimeType": "application/json",
            "responseSchema": response_schema,
        }

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }

    # Retry only explicit temporary upstream failures. Authentication, quota,
    # and invalid requests need action rather than repeated generation calls.
    models = [GEMINI_MODEL, GEMINI_MODEL, GEMINI_FALLBACK_MODEL or GEMINI_MODEL]
    for attempt, model in enumerate(models):
        request = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.loads(response.read())
            break
        except urllib.error.HTTPError as e:
            status = e.code
            e.close()
            if status in (500, 502, 503, 504):
                if attempt < len(models) - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise RuntimeError(
                    f"Gemini is temporarily unavailable ({status}). "
                    "Automatic retries could not complete. Please try again shortly."
                ) from e
            if status == 429:
                raise RuntimeError(
                    "Gemini API rate limit or quota exceeded - please try again later."
                ) from e
            if status in (401, 403):
                raise RuntimeError(
                    "Gemini API access was denied. Check the API key and its permissions."
                ) from e
            raise RuntimeError(f"Gemini API error: {status}") from e
        except urllib.error.URLError as e:
            raise RuntimeError("Gemini API unreachable. Check the server's internet connection.") from e
        except TimeoutError as e:
            raise RuntimeError("Gemini API request timed out. Please try again.") from e
        except json.JSONDecodeError as e:
            raise RuntimeError("Gemini returned an invalid response. Please try again.") from e

    try:
        return body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {body}") from e


def generate_mcqs(topic: str, count: int) -> list[dict]:
    """
    Asks Gemini for `count` multiple-choice questions on `topic`, each with
    exactly 4 options, a correct_answer, and a difficulty from 1-3.
    Returns the parsed list of question dicts. Raises RuntimeError on any
    API or parsing failure.
    """
    prompt = (
        f"Generate {count} multiple-choice questions on the topic \"{topic}\". "
        "Each question must have exactly 4 answer options, one correct_answer "
        "that exactly matches one of the options, and a difficulty rating from "
        "1 (easy) to 3 (hard). Phrase each prompt as a standalone recall question "
        "that also works on a flashcard without seeing the options. Generate questions only."
    )
    text = _call_gemini(prompt, response_schema=QUESTION_RESPONSE_SCHEMA)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {text}") from e


ZEN_SYSTEM_INSTRUCTION = (
    "You are Zen, a calm study companion in MindPace. Be brief and supportive. "
    "Help with focus and practice questions only. Never generate summaries, "
    "revision guides, or study notes. Do not tease or judge the learner. "
    "Timing and confidence are tentative practice signals, not evidence of distraction. "
    "Keep replies to 2-3 sentences."
)


def _describe_signals(signals: dict) -> str:
    """
    Turns the raw behavioral-signal numbers into a short line Zen can
    read and react to in-character, rather than handing the model bare
    numbers with no framing.
    """
    parts = []
    if signals.get("avg_confidence") is not None:
        parts.append(f"average stated confidence {signals['avg_confidence']:.2f}")
    if signals.get("accuracy") is not None:
        parts.append(f"accuracy {signals['accuracy']:.0%}")
    if signals.get("avg_response_time_ms") is not None:
        parts.append(f"average response time {signals['avg_response_time_ms'] / 1000:.1f}s")
    if signals.get("recent_pattern"):
        pattern = "".join("Y" if correct else "N" for correct in signals["recent_pattern"])
        parts.append(f"recent correct/incorrect pattern (oldest to newest): {pattern}")
    return "; ".join(parts)


def ask_assistant(message: str, topic: str | None = None, signals: dict | None = None) -> str:
    """
    Sends a student's message to Gemini as Zen, MindPace's study
    companion, and returns its reply. `topic` (the student's current
    topic) and `signals` (recent confidence/accuracy/response-time
    behavior from their current session) are folded into the prompt as
    context Zen can riff on — neither is required. Raises RuntimeError
    on any API or parsing failure.
    """
    system_instruction = ZEN_SYSTEM_INSTRUCTION
    if topic:
        system_instruction += f' The student is currently studying "{topic}".'
    if signals:
        signal_summary = _describe_signals(signals)
        if signal_summary:
            system_instruction += (
                f" Their behavioral signals from this session: {signal_summary}. "
                "Use these tentative signals supportively if they are "
                "answering quickly and missing, or uncertain "
                "without reciting the raw numbers back at them."
            )

    prompt = f"{system_instruction}\n\nStudent: {message}\nZen:"
    return _call_gemini(prompt).strip()


def classify_theme(entry_text: str) -> str:
    """
    Classifies a student's post-quiz reflection into a short detected theme
    (a few words, e.g. "confused formula vs concept"). Returns the theme as
    a bare phrase. Raises RuntimeError on any API or parsing failure.
    """
    prompt = (
        "A student just finished a quiz and wrote this one-line reflection on "
        f"what tripped them up:\n\n\"{entry_text}\"\n\n"
        "Classify it into a short theme, a few words only (e.g. \"confused "
        "formula vs concept\", \"ran out of time\", \"second-guessed a correct "
        "instinct\"). Reply with ONLY the theme phrase — no punctuation, no "
        "quotes, no explanation."
    )
    return _call_gemini(prompt).strip()


def generate_question_variant(question: dict) -> dict:
    """
    Given an existing question, asks Gemini for ONE new question testing
    the same underlying concept — different wording, scenario, and answer
    options — for spaced review. This is the "desirable difficulty"
    rephrasing referenced by questions.parent_question_id: reviewing a
    fresh variant instead of the memorized original.
    """
    options_text = ", ".join(question.get("options") or [])
    prompt = (
        "Here is an existing multiple-choice question:\n\n"
        f"Question: {question['prompt_text']}\n"
        f"Options: {options_text}\n"
        f"Correct answer: {question.get('correct_answer')}\n\n"
        "Write ONE new multiple-choice question that tests the exact same "
        "underlying concept, but with different wording, a different "
        "scenario or example, and different answer option text (do not "
        "reuse the original options verbatim). It must have exactly 4 "
        "options, one correct_answer that exactly matches one of those "
        "options, and the same difficulty rating "
        f"({question.get('difficulty', 1)})."
    )
    text = _call_gemini(prompt, response_schema=QUESTION_RESPONSE_SCHEMA)
    try:
        variants = json.loads(text)
        return variants[0]
    except (json.JSONDecodeError, IndexError, KeyError) as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {text}") from e


def generate_mcqs_from_document(document_text: str, count: int = 5) -> list[dict]:
    """
    Asks Gemini for `count` multiple-choice questions grounded specifically
    in `document_text` (not generic topic knowledge), same shape as
    generate_mcqs. Returns the parsed list of question dicts.
    """
    prompt = (
        f"Here is the text of a document:\n\n{document_text}\n\n"
        f"Generate {count} multiple-choice questions that test understanding "
        "of THIS SPECIFIC document's content — every question and correct "
        "answer must be answerable directly from the text above, not from "
        "general knowledge of the subject. Each question must have exactly "
        "4 answer options, one correct_answer that exactly matches one of "
        "the options, and a difficulty rating from 1 (easy) to 3 (hard). "
        "Include a mix of all three difficulty levels when the source permits. "
        "Phrase each prompt as a standalone recall question that also works on "
        "a flashcard without seeing the options. Generate questions only, never summaries or notes."
    )
    text = _call_gemini(prompt, response_schema=QUESTION_RESPONSE_SCHEMA)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {text}") from e
