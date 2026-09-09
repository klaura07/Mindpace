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
        "1 (easy) to 3 (hard)."
    )
    text = _call_gemini(prompt, response_schema=QUESTION_RESPONSE_SCHEMA)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {text}") from e


def generate_revision_guide(document_text: str) -> str:
    """
    Asks Gemini for a concise revision guide (key points + short summary)
    grounded in `document_text`. Returns the guide as plain text.
    """
    prompt = (
        "Here is the text of a document a student is studying:\n\n"
        f"{document_text}\n\n"
        "Write a concise revision guide for this document: a bulleted list "
        "of key points, followed by a short summary paragraph. Base it only "
        "on the content above, not on outside knowledge of the topic."
    )
    return _call_gemini(prompt)


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
        "the options, and a difficulty rating from 1 (easy) to 3 (hard)."
    )
    text = _call_gemini(prompt, response_schema=QUESTION_RESPONSE_SCHEMA)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {text}") from e
