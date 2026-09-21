"""
Pydantic models define the *shape* of data crossing the API boundary:
what a request must contain, what a response will contain.

FastAPI uses these for two things automatically: validating incoming
JSON (a malformed request becomes a clear 422 error, not a crash deep
in your code), and generating the interactive docs at /docs.
"""
from typing import Literal
from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator, model_validator


class UserLogin(BaseModel):
    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class UserCreate(UserLogin):
    password: SecretStr = Field(min_length=4, max_length=15)


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
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    response_time_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    response_mode: Literal["question", "flashcard"] = "question"
    recalled: bool | None = None

    @model_validator(mode="after")
    def validate_attempt(self):
        if self.response_mode == "flashcard" and self.recalled is None:
            raise ValueError("Flashcards require a recall rating")
        if self.response_mode == "question" and (not self.answer_text or not self.answer_text.strip()):
            raise ValueError("An answer is required")
        return self


class ResponseOut(BaseModel):
    response_id: int
    session_id: int
    question_id: int
    answer_text: str | None
    is_correct: int
    confidence: float
    response_time_ms: int | None
    answered_at: str
    response_mode: str = "question"
    correct_answer: str | None = None
    adaptation: dict | None = None


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
    questions: list[QuestionOut]


class ReviewItemOut(BaseModel):
    question_id: int
    topic: str
    prompt_text: str
    question_type: str
    options: list[str] | None
    correct_answer: str | None
    difficulty: int
    next_review_date: str


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


class AssistantRequest(BaseModel):
    message: str
    session_id: int | None = None


class AssistantResponse(BaseModel):
    reply: str
