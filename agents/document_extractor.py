"""
document_extractor.py — Extract structured content from teacher uploads.

Supported inputs:
  - Image (JPEG/PNG/WEBP): passed to Gemini Vision via base64
  - PDF: text extracted with PyMuPDF (already in requirements)
  - DOCX: text extracted with python-docx

Returns a dict:
  {
    "raw_text": str,          # concatenated text from all pages/sheets
    "topic_hint": str,        # best guess at the main topic
    "subtopics": [str],       # list of subtopics detected
    "key_concepts": [str],    # important terms / concepts
    "suggested_activities": [str],  # activities found in the document
  }
"""

import base64
import io
import json
import os
from typing import Optional

import fitz                  # PyMuPDF — already installed
from openai import OpenAI

from agents.llm_client import call_llm


_GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

_gemini_vision = OpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=_GEMINI_API_KEY or "NOT_CONFIGURED",
    timeout=60.0,
)


def _extract_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Send image to Gemini Vision and return extracted text."""
    b64 = base64.b64encode(image_bytes).decode()
    resp = _gemini_vision.chat.completions.create(
        model=_GEMINI_MODEL,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{b64}"},
                },
                {
                    "type": "text",
                    "text": (
                        "You are reading a Malaysian school textbook page or teacher note. "
                        "Extract ALL text exactly as it appears, including headings, "
                        "bullet points, tables, and diagrams described in words. "
                        "Preserve the document structure with newlines. "
                        "Output ONLY the extracted text, nothing else."
                    ),
                },
            ],
        }],
        max_tokens=4096,
    )
    return resp.choices[0].message.content or ""


def _extract_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF using PyMuPDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)


def _extract_docx(docx_bytes: bytes) -> str:
    """Extract text from DOCX using python-docx."""
    import docx as _docx
    doc = _docx.Document(io.BytesIO(docx_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def _structure_content(raw_text: str) -> dict:
    """Ask LLM to structure the raw text into topic/subtopics/concepts/activities."""
    prompt = f"""You are an expert Malaysian secondary school curriculum analyst.

Given this raw text from a teacher's document, extract structured information.

RAW TEXT:
{raw_text[:6000]}

Respond ONLY with a JSON object (no markdown) with these exact keys:
{{
  "topic_hint": "main subject topic in 5 words or fewer",
  "subtopics": ["list", "of", "subtopics"],
  "key_concepts": ["important", "terms", "concepts"],
  "suggested_activities": ["activity ideas suitable for an RPH"]
}}"""
    result = call_llm(prompt, want_json=True)
    try:
        data = json.loads(result.text)
        return {
            "topic_hint": data.get("topic_hint", ""),
            "subtopics": data.get("subtopics", []),
            "key_concepts": data.get("key_concepts", []),
            "suggested_activities": data.get("suggested_activities", []),
        }
    except Exception:
        return {
            "topic_hint": "",
            "subtopics": [],
            "key_concepts": [],
            "suggested_activities": [],
        }


def extract_document(
    file_bytes: bytes,
    filename: str,
    mime_type: Optional[str] = None,
) -> dict:
    """
    Main entry point. Returns structured content dict.
    mime_type: 'image/jpeg', 'image/png', 'application/pdf', 'application/vnd.openxmlformats...'
    """
    name_lower = filename.lower()
    if mime_type and mime_type.startswith("image/"):
        raw_text = _extract_image(file_bytes, mime_type)
    elif name_lower.endswith((".jpg", ".jpeg")):
        raw_text = _extract_image(file_bytes, "image/jpeg")
    elif name_lower.endswith(".png"):
        raw_text = _extract_image(file_bytes, "image/png")
    elif name_lower.endswith(".webp"):
        raw_text = _extract_image(file_bytes, "image/webp")
    elif name_lower.endswith(".pdf") or (mime_type == "application/pdf"):
        raw_text = _extract_pdf(file_bytes)
    elif name_lower.endswith(".docx"):
        raw_text = _extract_docx(file_bytes)
    else:
        raw_text = file_bytes.decode("utf-8", errors="replace")

    structured = _structure_content(raw_text)
    structured["raw_text"] = raw_text
    return structured
