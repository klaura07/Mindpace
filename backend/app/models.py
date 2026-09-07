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
