"""Shared helpers. Prompt format = Qwen ChatML exactly as the PWA builds it (llm.worker.ts)."""
import json

BASE = "Qwen/Qwen2.5-0.5B-Instruct"


def load_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def prompt_text(messages):
    """system + user turns, ending where the assistant starts (no trailing newline inside turns)."""
    return "".join(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n" for m in messages[:2]) + "<|im_start|>assistant\n"


def full_text(messages):
    return prompt_text(messages) + messages[2]["content"] + "<|im_end|>"


def extract_json(raw):
    """Same acceptance rule as extractJson() in llm.worker.ts."""
    a, b = raw.find("{"), raw.rfind("}")
    if a < 0 or b < 0:
        return None
    try:
        o = json.loads(raw[a:b + 1])
    except ValueError:
        return None
    ok = (isinstance(o.get("question"), str) and isinstance(o.get("options"), list)
          and len(o["options"]) >= 2 and isinstance(o.get("correct_answer"), str))
    return o if ok else None
