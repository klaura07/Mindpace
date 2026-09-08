"""
Thin wrapper around the Gemini API for MCQ generation.

Uses urllib (stdlib) instead of pulling in a new HTTP client dependency —
this is a single JSON POST, no need for an SDK.
"""
import json
import os
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv()

GEMINI_MODEL = "gemini-3.6-flash"
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


def generate_mcqs(topic: str, count: int) -> list[dict]:
    """
    Asks Gemini for `count` multiple-choice questions on `topic`, each with
    exactly 4 options, a correct_answer, and a difficulty from 1-3.
    Returns the parsed list of question dicts. Raises RuntimeError on any
    API or parsing failure.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")

    prompt = (
        f"Generate {count} multiple-choice questions on the topic \"{topic}\". "
        "Each question must have exactly 4 answer options, one correct_answer "
        "that exactly matches one of the options, and a difficulty rating from "
        "1 (easy) to 3 (hard)."
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": QUESTION_RESPONSE_SCHEMA,
        },
    }

    request = urllib.request.Request(
        f"{GEMINI_URL}?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        if os.getenv("DEBUG"):
            print(f"[gemini debug] {e.code} response body:\n{error_body}")
        raise RuntimeError(f"Gemini API error: {e.code} {error_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Gemini API unreachable: {e.reason}") from e

    try:
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        questions = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {body}") from e

    return questions
