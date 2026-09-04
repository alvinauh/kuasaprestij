"""
Lightweight structured error logger.
Writes one JSON line per error to logs/errors.jsonl.
Run error_report.py to generate a readable markdown digest.
"""

import json
import logging
import traceback
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

_LOG_PATH = Path(__file__).parent.parent / "logs" / "errors.jsonl"
_LOG_PATH.parent.mkdir(exist_ok=True)

_handler = RotatingFileHandler(_LOG_PATH, maxBytes=5_000_000, backupCount=3, encoding="utf-8")
_handler.setFormatter(logging.Formatter("%(message)s"))

_logger = logging.getLogger("kuasaprestij.errors")
_logger.setLevel(logging.ERROR)
_logger.addHandler(_handler)
_logger.propagate = False


def log_error(exc: Exception, context: str = ""):
    """Write a structured error entry to logs/errors.jsonl."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "context": context,
        "error": type(exc).__name__,
        "message": str(exc)[:500],
        "traceback": traceback.format_exc()[-2000:],
    }
    _logger.error(json.dumps(entry))
