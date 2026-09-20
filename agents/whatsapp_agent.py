"""
Outbound WhatsApp sender via Twilio.
Keep this module import-free from other agents to avoid circular imports.
All command routing lives in app/main.py where every agent is already imported.
"""
import os
from twilio.rest import Client


def _client() -> Client:
    return Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))


def send_whatsapp(to: str, body: str) -> None:
    """Send a WhatsApp message to any number (e.g. '+60123456789')."""
    if not os.getenv("TWILIO_ACCOUNT_SID"):
        print(f"[WhatsApp] TWILIO not configured — would send to {to}: {body[:60]}")
        return
    _client().messages.create(
        from_=f"whatsapp:{os.getenv('TWILIO_WHATSAPP_FROM', '+14155238886')}",
        to=f"whatsapp:{to}",
        body=body[:1600],  # WhatsApp message cap
    )


def alert_teacher(body: str) -> None:
    """Push a message to the configured teacher number."""
    teacher = os.getenv("TEACHER_WHATSAPP_NUMBER")
    if not teacher:
        print("[WhatsApp] TEACHER_WHATSAPP_NUMBER not set — skipping alert")
        return
    send_whatsapp(teacher, body)
