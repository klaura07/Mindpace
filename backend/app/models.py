"""
Pydantic models define the *shape* of data crossing the API boundary:
what a request must contain, what a response will contain.

FastAPI uses these for two things automatically: validating incoming
JSON (a malformed request becomes a clear 422 error, not a crash deep
in your code), and generating the interactive docs at /docs.
"""
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr


class UserOut(BaseModel):
    user_id: int
    email: str
    created_at: str


class QuestionCreate(BaseModel):
    topic: str
    prompt_text: str
    reference_answer: str | None = None
    question_type: str = "mcq"
    options: list[str] | None = None
    correct_answer: str | None = None
    difficulty: int = 1
    parent_question_id: int | None = None


class QuestionOut(BaseModel):
    question_id: int
    topic: str
    prompt_text: str
    reference_answer: str | None
    question_type: str
    options: list[str] | None
    correct_answer: str | None
    difficulty: int
    parent_question_id: int | None
    created_at: str


class SessionCreate(BaseModel):
    user_id: int


class SessionOut(BaseModel):
    session_id: int
    user_id: int
    start_time: str
    end_time: str | None


class ResponseCreate(BaseModel):
    session_id: int
    question_id: int
    answer_text: str | None = None
    confidence: float
    response_time_ms: int | None = None


class ResponseOut(BaseModel):
    response_id: int
    session_id: int
    question_id: int
    answer_text: str | None
    is_correct: int
    confidence: float
    response_time_ms: int | None
    answered_at: str


class CalibrationScoreOut(BaseModel):
    score_id: int
    user_id: int
    calibration_gap: float
    computed_at: str


class QuestionGenerateRequest(BaseModel):
    topic: str
    count: int = 5


class DocumentOut(BaseModel):
    document_id: int
    user_id: int
    filename: str
    extracted_text: str | None
    uploaded_at: str


class DocumentGenerateResponse(BaseModel):
    revision_guide: str
    questions: list[QuestionOut]


class LearningStateTopicCounts(BaseModel):
    topic: str
    counts: dict[str, int]


class JournalEntryCreate(BaseModel):
    session_id: int
    entry_text: str


class JournalEntryOut(BaseModel):
    entry_id: int
    session_id: int
    entry_text: str
    detected_theme: str | None
    created_at: str
