"""
llm_client.py — provider fallback chain with cooldown tracking.

Free tier (Llama 3.3 70B — consistent with existing anchor cache):
  1. Cerebras   — 1 M free tokens/day, fastest inference
  2. OpenRouter — free Llama (~1000 req/day with credits)
  3. GroqCloud  — free Llama (14 400 req/day, 30 RPM)

Paid fallback (only when all free tiers exhausted):
  4. DeepSeek   — $0.14/M input · $0.28/M output · ~$3.50/month at 100 sessions/day

All providers use OpenAI-compatible endpoints.
Embeddings are local (sentence-transformers) — completely independent of LLM choice.

Rate limit strategy:
  - On rate limit: mark provider as cooling for 65 s, immediately try next provider.
  - When all providers are cooling: sleep until the earliest recovery, then retry.
  - This means seeding scripts never permanently skip an item — they just wait.

Usage:
    from agents.llm_client import call_llm, embed_text
    res = call_llm(prompt)                          # _TextResponse with .text
    res = call_llm(prompt, role="light")            # lighter/faster model
    res = call_llm(prompt, want_json=True)          # enforces JSON output
    res = call_llm(prompt, free_only=True)          # skip DeepSeek (for seeding)
    vec = embed_text("some text")                   # list[float], 768-dim
"""

import json
import os
import threading
import time
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError
from app.telemetry import log_llm_call, log_span, get_llm_context

load_dotenv(override=True)

# ---------------------------------------------------------------------------
# Presentation mode — PRESENTATION_MODE=1 bypasses all LLM API calls.
# Returns realistic canned responses that match every schema the pipeline
# expects.  Set in .env before a demo and restart the server.
# ---------------------------------------------------------------------------
_PRESENTATION_MODE = os.getenv("PRESENTATION_MODE", "").lower() in ("1", "true", "yes")

# Canned JSON strings keyed by the schema the calling node expects.
# Detection is keyword-based on the prompt text.
_DEMO_ANCHOR = json.dumps({
    "mnemonic_lyrics": "Demo mode — no LLM call made",
    "b_roll_search_query": "classroom Malaysia secondary school",
    "anchor_question": {
        "question_type": "mcq",
        "kbat_level": "Memahami",
        "illustrative_notes": "",
        "stimulus": "",
        "source_excerpt": "",
        "question": "Apakah yang dimaksudkan dengan daya dalam fizik?",
        "options": [
            "Tarikan atau tolakan yang boleh mengubah keadaan gerakan benda",
            "Berat sesuatu objek",
            "Kelajuan sesuatu objek",
            "Tenaga yang tersimpan dalam benda"
        ],
        "correct_answer": "Tarikan atau tolakan yang boleh mengubah keadaan gerakan benda",
        "distractor_rationale": {
            "Berat sesuatu objek": "Weight is caused by gravitational force, not force itself",
            "Kelajuan sesuatu objek": "Speed is a property of motion, not force",
            "Tenaga yang tersimpan dalam benda": "Stored energy is potential energy, not force"
        }
    },
    "drag_sentence": "Daya ialah ___ atau tolakan yang boleh mengubah keadaan gerakan benda.",
    "drag_distractors": ["kelajuan", "jisim", "tenaga"]
})

_DEMO_MCQ_FEEDBACK = json.dumps({
    "student_feedback": "Jawapan kurang tepat. Cuba semak semula definisi daya dan perbezaannya dengan tenaga.",
    "teacher_insight": {
        "error_category": "Conceptual Gap",
        "root_cause_analysis": "Student confused force with a related concept (energy or speed).",
        "actionable_intervention": "Use a tug-of-war demonstration to show force as push/pull."
    }
})

_DEMO_SHORT_ANSWER_EVAL = json.dumps({
    "marks_awarded": 2,
    "partial_credit": 0.7,
    "student_feedback": "Jawapan anda menunjukkan pemahaman asas yang baik. Cuba huraikan dengan lebih terperinci.",
    "concepts_addressed": ["definisi daya", "unit SI"],
    "concepts_missing": ["contoh aplikasi dalam kehidupan harian"],
    "teacher_insight": {
        "error_category": "Partial Understanding",
        "root_cause_analysis": "Student knows definition but lacks applied context.",
        "actionable_intervention": "Link concept to real-world examples during next lesson."
    }
})

_DEMO_ESSAY_EVAL = json.dumps({
    "marks_awarded": 6,
    "partial_credit": 0.6,
    "band_awarded": "B",
    "student_feedback": "Esei anda menunjukkan pemahaman yang baik tentang topik ini. Perlu lebih banyak hujah yang disokong dengan bukti.",
    "strengths": ["Struktur perenggan yang jelas", "Penggunaan istilah saintifik yang tepat"],
    "improvements": ["Tambah lebih banyak contoh", "Perkukuh kesimpulan dengan merujuk soalan"],
    "model_answer_outline": "Pendahuluan → definisi → 3 hujah dengan bukti → kesimpulan",
    "teacher_insight": {
        "error_category": "Partial Understanding",
        "root_cause_analysis": "Student has knowledge but struggles to construct extended arguments.",
        "actionable_intervention": "Practise PEEL paragraph structure with scaffolded frames."
    }
})

_DEMO_GENERIC_MCQ = json.dumps({
    "question_type": "mcq",
    "kbat_level": "Memahami",
    "illustrative_notes": "",
    "stimulus": "",
    "source_excerpt": "",
    "question": "Apakah unit SI bagi daya?",
    "options": ["Newton (N)", "Joule (J)", "Watt (W)", "Pascal (Pa)"],
    "correct_answer": "Newton (N)",
    "distractor_rationale": {
        "Joule (J)": "Joule is the unit of energy, not force",
        "Watt (W)": "Watt is the unit of power",
        "Pascal (Pa)": "Pascal is the unit of pressure"
    }
})


def _demo_response(prompt: str) -> "_TextResponse":
    """Return a realistic canned JSON response without any API call."""
    p = prompt.lower()
    if "anchor_question" in p or "mnemonic_lyrics" in p or "b_roll" in p:
        return _TextResponse(_DEMO_ANCHOR)
    if "marks_awarded" in p and ("short_answer" in p or "sub_part" in p or "sample_answer" in p):
        return _TextResponse(_DEMO_SHORT_ANSWER_EVAL)
    if "marks_awarded" in p and "band_awarded" in p:
        return _TextResponse(_DEMO_ESSAY_EVAL)
    if "student_feedback" in p and ("distractor" in p or "mcq" in p or "wrong option" in p):
        return _TextResponse(_DEMO_MCQ_FEEDBACK)
    # generator_node question schemas
    return _TextResponse(_DEMO_GENERIC_MCQ)


if _PRESENTATION_MODE:
    print("⚡ PRESENTATION_MODE is ON — all LLM calls return instant canned responses. "
          "No API quota consumed. Unset PRESENTATION_MODE in .env and restart to disable.")

_NOT_SET = "NOT_CONFIGURED"

# ---------------------------------------------------------------------------
# Client initialisation — all OpenAI-compatible
# ---------------------------------------------------------------------------
_cerebras = OpenAI(
    base_url="https://api.cerebras.ai/v1",
    api_key=os.getenv("CEREBRAS_API_KEY") or _NOT_SET,
    timeout=45.0,
)
_openrouter = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY") or _NOT_SET,
    timeout=45.0,
)
_groq = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.getenv("GROQ_API_KEY") or _NOT_SET,
    timeout=45.0,
)
_deepseek = OpenAI(
    base_url="https://api.deepseek.com/v1",
    api_key=os.getenv("DEEPSEEK_API_KEY") or _NOT_SET,
    timeout=60.0,
)

# ── SambaNova Cloud (free 1M tokens/day, fastest open-model inference) ───────
# Drop-in Cerebras replacement. Sign up at sambanova.ai → API → Get free key.
# Set SAMBANOVA_API_KEY in .env to activate; transparently skipped if unset.
_sambanova = OpenAI(
    base_url="https://api.sambanova.ai/v1",
    api_key=os.getenv("SAMBANOVA_API_KEY") or _NOT_SET,
    timeout=45.0,
)

# ── Mistral AI (free tier, no CC required) ───────────────────────────────────
# Sign up at console.mistral.ai → API Keys. Free tier, OpenAI-compatible.
# Set MISTRAL_API_KEY in .env to activate; transparently skipped if unset.
_mistral = OpenAI(
    base_url="https://api.mistral.ai/v1",
    api_key=os.getenv("MISTRAL_API_KEY") or _NOT_SET,
    timeout=45.0,
)

# ── Gemini (PRIMARY paid provider, top of the default chain) ────────────────
# Google's OpenAI-compatible endpoint. Uses the primary GEMINI_API_KEY and sits at
# the FRONT of the chain (Gemini→Cerebras→Groq→OpenRouter→DeepSeek). Paid on every
# call, so it is skipped for free_only=True seeding jobs. If GEMINI_API_KEY is unset
# it's transparently skipped and the chain starts at Cerebras.
_GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-3.7-flash"
_gemini_main = OpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_API_KEY") or _NOT_SET,
    timeout=60.0,
)

# ── Gemini (ISOLATED test provider) ────────────────────────────────────────
# Reachable ONLY via call_llm(gemini_only=True) / LLM_TEST_GEMINI. Uses the dedicated
# GEMINI_TEST_API_KEY so isolated testing can't disturb the primary key's quota.
_GEMINI_TEST_MODEL = os.getenv("GEMINI_TEST_MODEL") or "gemini-3.7-flash"
_gemini = OpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_TEST_API_KEY") or os.getenv("GEMINI_API_KEY") or _NOT_SET,
    timeout=60.0,
)

if os.getenv("LLM_TEST_GEMINI", "").lower() in ("1", "true", "yes"):
    print(f"⚠️  LLM_TEST_GEMINI is ON — ALL LLM calls route to Gemini ({_GEMINI_TEST_MODEL}). "
          "Unset LLM_TEST_GEMINI in .env + restart to return to the normal chain.")

# ---------------------------------------------------------------------------
# Model registry
# Chain order: Gemini → SambaNova → Cerebras → Groq → OpenRouter → DeepSeek
# SambaNova and Cerebras are free; Gemini and DeepSeek are paid.
# ---------------------------------------------------------------------------
_MODELS = {
    "main": (
        _GEMINI_MODEL,                                    # Gemini (paid, primary)
        "Meta-Llama-3.3-70B-Instruct",                   # SambaNova — 1M free tokens/day, sub-500ms
        "qwen-3.8-27b",                                   # Cerebras — llama3.3-70b retired; qwen-3.8-27b is current free model
        "qwen/qwen3.8-27b",                               # Groq — fast, 14k req/day free
        "open-mistral-7b",                                # Mistral — free tier, no CC (resolves to ministral-8b)
        "nvidia/nemotron-3.5-lightning:free",             # OpenRouter free fallback
        "deepseek-chat",                                  # DeepSeek (paid, 100% reliable)
    ),
    "light": (
        _GEMINI_MODEL,                                    # Gemini (paid, primary)
        "Meta-Llama-3.3-70B-Instruct",                   # SambaNova
        "qwen-3.8-27b",                                   # Cerebras
        "qwen/qwen3.8-27b",                               # Groq
        "open-mistral-7b",                                # Mistral — free tier
        "nvidia/nemotron-3.5-lightning:free",             # OpenRouter free
        "deepseek-chat",                                  # DeepSeek (paid)
    ),
}

# ---------------------------------------------------------------------------
# Per-provider cooldown registry
# Keyed by provider label. Value = monotonic time when the provider is usable again.
# Thread-safe — used from both API request threads and long-running seed scripts.
# ---------------------------------------------------------------------------
_cooldowns: dict[str, float] = {}
_cooldown_lock = threading.Lock()
_COOLDOWN_SECS = 65.0  # just past the next minute boundary for RPM limits


def _mark_cooling(label: str, seconds: float = _COOLDOWN_SECS) -> None:
    with _cooldown_lock:
        _cooldowns[label] = time.monotonic() + seconds
    print(f"-> {label}: cooling for {seconds:.0f}s.")
    trace_id, node = get_llm_context()
    log_span(trace_id or "system", "llm_failover", label, 0.0, "rate_limited", provider=label)


def _is_cooling(label: str) -> bool:
    with _cooldown_lock:
        return time.monotonic() < _cooldowns.get(label, 0.0)


def _wait_for_any(providers: list) -> None:
    """Block until at least one provider in the list is out of cooldown."""
    while True:
        available = [label for _, _, label, _ in providers if not _is_cooling(label)]
        if available:
            return
        with _cooldown_lock:
            earliest = min(_cooldowns.get(label, 0.0) for _, _, label, _ in providers)
        wait = max(1.0, earliest - time.monotonic())
        print(f"-> All providers rate-limited. Waiting {wait:.0f}s for {_next_label(providers)} to recover…")
        time.sleep(wait)


def _next_label(providers: list) -> str:
    with _cooldown_lock:
        return min(providers, key=lambda p: _cooldowns.get(p[2], 0.0))[2]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_embedder = None


def _get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        print("-> Loading sentence-transformers model (first call only)…")
        _embedder = SentenceTransformer("paraphrase-multilingual-mpnet-base-v2")
    return _embedder


class _TextResponse:
    """Wraps an LLM text response — exposes .text, .strip(), str(), bool()."""
    def __init__(self, text: str):
        self.text = text

    def strip(self):
        return self.text.strip()

    def __str__(self):
        return self.text

    def __bool__(self):
        return bool(self.text)


def _starts_like_json(text: str) -> bool:
    """JSON object/array, optionally inside a ```json fence. Reasoning preambles fail."""
    t = (text or "").lstrip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1].lstrip() if "\n" in t else ""
    return t.startswith(("{", "["))


def _has_key(client: OpenAI) -> bool:
    try:
        return bool(client.api_key) and client.api_key != _NOT_SET
    except Exception:
        return False


def _try_provider(
    client: OpenAI,
    model: str,
    kwargs: dict,
    label: str,
    role: str = "main",
    prompt: str = "",
) -> "_TextResponse | None":
    """
    Single attempt at one provider. Returns response or None.
    On rate limit: marks provider as cooling and returns None immediately.
    Logs every attempt (success or failure) to llm_call_logs via telemetry.
    """
    if not _has_key(client):
        return None
    if _is_cooling(label):
        return None
    t0 = time.monotonic()
    try:
        r = client.chat.completions.create(model=model, **kwargs)
        duration_ms = (time.monotonic() - t0) * 1000
        if not r.choices:
            log_llm_call(label, model, role, "no_content", duration_ms, prompt=prompt)
            return None
        content = r.choices[0].message.content
        if not content:
            log_llm_call(label, model, role, "no_content", duration_ms, prompt=prompt)
            return None
        tokens_in = getattr(r.usage, "prompt_tokens", None) if r.usage else None
        tokens_out = getattr(r.usage, "completion_tokens", None) if r.usage else None
        log_llm_call(label, model, role, "ok", duration_ms,
                     tokens_in=tokens_in, tokens_out=tokens_out,
                     prompt=prompt, response=content)
        return _TextResponse(content)
    except RateLimitError:
        duration_ms = (time.monotonic() - t0) * 1000
        log_llm_call(label, model, role, "rate_limited", duration_ms, prompt=prompt)
        _mark_cooling(label)
        return None
    except Exception as e:
        duration_ms = (time.monotonic() - t0) * 1000
        err_str = str(e)
        log_llm_call(label, model, role, "error", duration_ms, prompt=prompt, response=err_str)
        if "response_format is not supported" in err_str or "Venice" in err_str:
            _mark_cooling(label, seconds=10.0)
        elif (
            "402" in err_str
            or "payment_required" in err_str.lower()
            or "insufficient credits" in err_str.lower()
            or "payment required" in err_str.lower()
        ):
            # Billing exhausted — won't recover until account is topped up.
            # Cool for 24h to avoid burning latency on every request.
            _mark_cooling(label, seconds=86400.0)
        else:
            print(f"-> {label} error ({type(e).__name__}: {e}), trying next provider…")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def call_llm(
    prompt: str,
    role: str = "main",
    want_json: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    free_only: bool = False,
    cerebras_only: bool = False,
    gemini_only: bool = False,
) -> _TextResponse:
    """
    Provider order: Gemini → SambaNova → Cerebras → GroqCloud → Mistral → OpenRouter → DeepSeek.

    free_only=True     skips DeepSeek — use for seeding to avoid paid charges.
    cerebras_only=True uses only Cerebras; blocks/waits on rate limit rather
                       than falling through to other providers. Use for seeding
                       when you want a single controlled budget (1M tokens/day).
    gemini_only=True   uses ONLY the isolated Gemini test provider (GEMINI_TEST_API_KEY).
                       Never touches the default chain or the other providers' quotas —
                       for evaluating Gemini in isolation.

    On rate limits: cools the provider and immediately tries the next one.
    If all providers are cooling, waits until the earliest one recovers
    then retries — so this call NEVER permanently fails due to rate limits.

    Raises RuntimeError only if every provider lacks an API key or errors
    in a non-rate-limit way.
    """
    # Presentation bypass — instant canned response, zero API calls.
    if _PRESENTATION_MODE:
        return _demo_response(prompt)

    # Global test switch: LLM_TEST_GEMINI=1 in .env routes EVERY app call through the
    # isolated Gemini test provider — so you can exercise Gemini live in the webapp
    # without changing any call sites. Unset it (and restart) to revert to the chain.
    if os.getenv("LLM_TEST_GEMINI", "").lower() in ("1", "true", "yes"):
        gemini_only = True

    gm_model, sn_model, cb_model, groq_model, ms_model, or_model, ds_model = _MODELS.get(role, _MODELS["main"])

    kwargs: dict = dict(
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if want_json:
        kwargs["response_format"] = {"type": "json_object"}

    # OpenRouter: strip response_format (many free models don't support JSON mode).
    # The calling code uses parse_llm_json() which handles markdown-wrapped JSON anyway.
    or_kwargs = {k: v for k, v in kwargs.items() if k != "response_format"}

    if gemini_only:
        # Isolated test path — ONLY the test Gemini, never the default chain.
        providers = [(_gemini, _GEMINI_TEST_MODEL, "Gemini(test)", kwargs)]
    elif cerebras_only:
        providers = [(_cerebras, cb_model, "Cerebras", kwargs)]
    else:
        # Default chain: Gemini → SambaNova → Cerebras → Groq → Mistral → OpenRouter → DeepSeek.
        # Gemini and DeepSeek are PAID → excluded from free_only seeding jobs, which
        # then run SambaNova → Cerebras → Groq → Mistral → OpenRouter (all free) only.
        providers = []
        if not free_only:
            providers.append((_gemini_main, gm_model, "Gemini", kwargs))
        providers += [
            (_sambanova,  sn_model,   "SambaNova",  kwargs),
            (_cerebras,   cb_model,   "Cerebras",   kwargs),
            (_groq,       groq_model, "GroqCloud",  kwargs),
            (_mistral,    ms_model,   "Mistral",    kwargs),
            (_openrouter, or_model,   "OpenRouter",  or_kwargs),
        ]
        if not free_only:
            ds = (_deepseek, ds_model, "DeepSeek", kwargs)
            if want_json:
                # The free OpenRouter model reasons in plain text for ~90 s and never
                # returns JSON (measured 2026-10-06), so for JSON calls DeepSeek (~1 s)
                # goes first. OpenRouter stays as the last resort.
                providers.insert(len(providers) - 1, ds)
            else:
                providers.append(ds)

    # Filter out providers with no key at all (permanent skip, not cooldown)
    configured = [(c, m, l, kw) for c, m, l, kw in providers if _has_key(c)]
    if not configured:
        raise RuntimeError("No LLM providers configured. Check API keys in .env.")

    # For JSON calls, a reply that isn't JSON (e.g. a free reasoning model writing
    # "Here's a thinking process…" until max_tokens runs out) moves on to the next
    # provider. It is only returned if no provider gives JSON.
    not_json = None
    while True:
        for client, model, label, provider_kwargs in configured:
            result = _try_provider(client, model, provider_kwargs, label, role=role, prompt=prompt)
            if result is None:
                continue
            if want_json and not _starts_like_json(result.text):
                print(f"-> {label}: reply is not JSON ({result.text[:40]!r}…), trying next provider…")
                not_json = not_json or result
                continue
            return result
        if not_json is not None:
            return not_json

        # All providers either cooling or errored — wait for recovery
        cooling = [(c, m, l, kw) for c, m, l, kw in configured if _is_cooling(l)]
        if len(cooling) == len(configured):
            _wait_for_any(configured)
        else:
            # Non-rate-limit errors on all — bail to avoid infinite loop
            raise RuntimeError("All LLM providers failed (non-rate-limit errors). Check API keys and quotas.")


def embed_text(text: str) -> list:
    """Local sentence-transformers embeddings (768-dim, BM/EN/ZH). Free, no API call."""
    return _get_embedder().encode(text).tolist()
