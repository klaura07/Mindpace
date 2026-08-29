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
