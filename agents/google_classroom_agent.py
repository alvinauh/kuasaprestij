"""
Google Classroom integration agent.
Handles OAuth 2.0 flow, roster import, and grade push via the Google Classroom API.

Required env vars:
  GOOGLE_CLIENT_ID      — OAuth 2.0 Web Application client ID
  GOOGLE_CLIENT_SECRET  — OAuth 2.0 client secret
  GOOGLE_REDIRECT_URI   — Must match the URI registered in Google Cloud Console
                          e.g. https://api.kuasa.tech:8443/google/callback
  FRONTEND_URL          — Where to redirect after OAuth success/failure
                          e.g. https://kuasa.tech/teacher
"""

import os
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GRequest
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.students",
    "https://www.googleapis.com/auth/classroom.profile.emails",
]

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/google/callback"
)
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173/teacher")

_CLIENT_CONFIG = {
    "web": {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uris": [GOOGLE_REDIRECT_URI],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}


def configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def create_auth_url(teacher_id: str) -> str:
    """Generate a Google OAuth URL. State = teacher_id so callback knows who to store for."""
    if not configured():
        raise ValueError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set")
    flow = Flow.from_client_config(_CLIENT_CONFIG, scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=teacher_id,
    )
    return url


def exchange_code(code: str) -> dict:
    """Exchange auth code for tokens. Returns dict with access_token, refresh_token, expiry."""
    flow = Flow.from_client_config(_CLIENT_CONFIG, scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)
    flow.fetch_token(code=code)
    creds = flow.credentials
    expiry = creds.expiry.isoformat() if creds.expiry else None
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_expiry": expiry,
        "scopes": list(creds.scopes or SCOPES),
    }


def _build_service(token_data: dict):
    """Build an authenticated Google Classroom API service, refreshing if needed."""
    expiry = None
    if token_data.get("token_expiry"):
        try:
            expiry = datetime.fromisoformat(token_data["token_expiry"])
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
        except ValueError:
            expiry = None

    creds = Credentials(
        token=token_data["access_token"],
        refresh_token=token_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=token_data.get("scopes", SCOPES),
        expiry=expiry,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(GRequest())
    return build("classroom", "v1", credentials=creds, cache_discovery=False), creds


def list_courses(token_data: dict) -> list[dict]:
    """Return courses where the teacher is an OWNER or TEACHER."""
    service, _ = _build_service(token_data)
    results = []
    page_token = None
    while True:
        resp = service.courses().list(
            teacherId="me",
            courseStates=["ACTIVE"],
            pageToken=page_token,
            pageSize=50,
        ).execute()
        results.extend(resp.get("courses", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return [
        {
            "id": c["id"],
            "name": c["name"],
            "section": c.get("section", ""),
            "enrollment_code": c.get("enrollmentCode", ""),
            "student_count": c.get("courseState", ""),
        }
        for c in results
    ]


def list_course_students(token_data: dict, google_course_id: str) -> list[dict]:
    """Return [{userId, email, full_name}] for all students in a Google Classroom course."""
    service, _ = _build_service(token_data)
    students = []
    page_token = None
    while True:
        resp = service.courses().students().list(
            courseId=google_course_id,
            pageToken=page_token,
            pageSize=200,
        ).execute()
        students.extend(resp.get("students", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return [
        {
            "google_user_id": s["userId"],
            "email": s.get("profile", {}).get("emailAddress", ""),
            "full_name": s.get("profile", {}).get("name", {}).get("fullName", ""),
        }
        for s in students
    ]


def _get_or_create_coursework(service, google_course_id: str) -> str:
    """Return courseWork ID for 'KuasaPrestij Progress', creating it if needed."""
    resp = service.courses().courseWork().list(
        courseId=google_course_id,
        pageSize=50,
    ).execute()
    for cw in resp.get("courseWork", []):
        if "kuasaprestij" in cw.get("title", "").lower():
            return cw["id"]

    cw = service.courses().courseWork().create(
        courseId=google_course_id,
        body={
            "title": "KuasaPrestij Progress",
            "description": "Auto-synced mastery scores from KuasaPrestij adaptive assessment.",
            "workType": "ASSIGNMENT",
            "state": "PUBLISHED",
            "maxPoints": 100,
            "submissionModificationMode": "MODIFIABLE_UNTIL_TURNED_IN",
        },
    ).execute()
    return cw["id"]


def push_grades(
    token_data: dict,
    google_course_id: str,
    grades: list[dict],  # [{google_user_id, mastery_pct}]
) -> dict:
    """
    Post mastery scores as grades for a 'KuasaPrestij Progress' assignment.
    Returns {succeeded: int, failed: int, coursework_id: str}.
    """
    service, _ = _build_service(token_data)
    cw_id = _get_or_create_coursework(service, google_course_id)

    succeeded = 0
    failed = 0
    for g in grades:
        try:
            subs = service.courses().courseWork().studentSubmissions().list(
                courseId=google_course_id,
                courseWorkId=cw_id,
                userId=g["google_user_id"],
            ).execute()
            sub_list = subs.get("studentSubmissions", [])
            if not sub_list:
                failed += 1
                continue
            sub_id = sub_list[0]["id"]
            service.courses().courseWork().studentSubmissions().patch(
                courseId=google_course_id,
                courseWorkId=cw_id,
                id=sub_id,
                updateMask="assignedGrade,draftGrade",
                body={
                    "assignedGrade": round(g["mastery_pct"]),
                    "draftGrade": round(g["mastery_pct"]),
                },
            ).execute()
            succeeded += 1
        except HttpError:
            failed += 1

    return {"succeeded": succeeded, "failed": failed, "coursework_id": cw_id}
