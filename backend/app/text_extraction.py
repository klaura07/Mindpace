"""
Extracts plain text from an uploaded document based on its filename extension.
"""
import io

from docx import Document
from PyPDF2 import PdfReader


def extract_text(filename: str, content: bytes) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    if ext == "docx":
        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)

    if ext == "txt":
        return content.decode("utf-8", errors="replace")

    raise ValueError(f"Unsupported file type: .{ext}")
