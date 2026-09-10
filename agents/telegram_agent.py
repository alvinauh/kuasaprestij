"""
Telegram bot integration — replaces Twilio/WhatsApp.

Outbound alerts  : send_telegram(chat_id, text) or alert_admin(text)
Inbound commands : handled by /webhook/telegram in app/main.py

Setup (one-time):
  1. Create a bot via @BotFather → copy the token to TELEGRAM_BOT_TOKEN
  2. Start a chat with the bot (or add it to a group) → get the chat ID:
       curl https://api.telegram.org/bot<TOKEN>/getUpdates
  3. Set TELEGRAM_ADMIN_CHAT_ID to that chat ID
  4. Register the webhook (replace <TOKEN> and <YOUR_DOMAIN>):
       curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/webhook/telegram"

Environment variables:
  TELEGRAM_BOT_TOKEN      — required for any outbound message
  TELEGRAM_ADMIN_CHAT_ID  — chat ID for alert_admin() calls (teacher/admin)
"""

import os
import urllib.request
import urllib.parse
import json

_BASE = "https://api.telegram.org/bot"


def _token() -> str | None:
    return os.getenv("TELEGRAM_BOT_TOKEN")


def send_telegram(chat_id: str | int, text: str, parse_mode: str = "Markdown") -> bool:
    """
    Send a message to any chat ID. Returns True on success.
    Never raises — failures are logged to stdout only.
    """
    token = _token()
    if not token:
        print(f"[Telegram] TELEGRAM_BOT_TOKEN not set — would send to {chat_id}: {text[:80]}")
        return False

    url = f"{_BASE}{token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text[:4096],  # Telegram message cap
        "parse_mode": parse_mode,
    }).encode()

    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"[Telegram] send failed: {e}")
        return False


def alert_admin(text: str) -> bool:
    """Push a message to the configured admin/teacher chat."""
    chat_id = os.getenv("TELEGRAM_ADMIN_CHAT_ID")
    if not chat_id:
        print("[Telegram] TELEGRAM_ADMIN_CHAT_ID not set — skipping alert")
        return False
    return send_telegram(chat_id, text)
