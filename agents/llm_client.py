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

import os
import threading
import time
from dotenv import load_dotenv
from openai import OpenAI, RateLimitError

load_dotenv(override=True)

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

# ── Gemini (PRIMARY paid provider, top of the default chain) ────────────────
# Google's OpenAI-compatible endpoint. Uses the primary GEMINI_API_KEY and sits at
# the FRONT of the chain (Gemini→Cerebras→Groq→OpenRouter→DeepSeek). Paid on every
# call, so it is skipped for free_only=True seeding jobs. If GEMINI_API_KEY is unset
# it's transparently skipped and the chain starts at Cerebras.
_GEMINI_MODEL = os.getenv("GEMINI_MODEL") or "gemini-3-flash-preview"
_gemini_main = OpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_API_KEY") or _NOT_SET,
    timeout=60.0,
)

# ── Gemini (ISOLATED test provider) ────────────────────────────────────────
# Reachable ONLY via call_llm(gemini_only=True) / LLM_TEST_GEMINI. Uses the dedicated
# GEMINI_TEST_API_KEY so isolated testing can't disturb the primary key's quota.
_GEMINI_TEST_MODEL = os.getenv("GEMINI_TEST_MODEL") or "gemini-3-flash-preview"
_gemini = OpenAI(
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    api_key=os.getenv("GEMINI_TEST_API_KEY") or os.getenv("GEMINI_API_KEY") or _NOT_SET,
    timeout=60.0,
)

if os.getenv("LLM_TEST_GEMINI", "").lower() in ("1", "true", "yes"):
    print(f"⚠️  LLM_TEST_GEMINI is ON — ALL LLM calls route to Gemini ({_GEMINI_TEST_MODEL}). "
          "Unset LLM_TEST_GEMINI in .env + restart to return to the normal chain.")

# ---------------------------------------------------------------------------
# Model registry — (gemini, cerebras, openrouter, groq, deepseek)
# Chain order is Gemini → Cerebras → Groq → OpenRouter → DeepSeek (built in call_llm).
# ---------------------------------------------------------------------------
_MODELS = {
    "main": (
        _GEMINI_MODEL,                                # Gemini (paid, primary)
        "gpt-oss-120b",                               # Cerebras (120B, ~300ms)
        "meta-llama/llama-3.3-70b-instruct:free",     # OpenRouter
        "llama-3.3-70b-versatile",                    # Groq
        "deepseek-chat",                              # DeepSeek (paid)
    ),
    "light": (
        _GEMINI_MODEL,                                # Gemini (paid, primary)
        "gemma-4-31b",                                # Cerebras (31B, fastest)
        "meta-llama/llama-3.1-8b-instruct:free",      # OpenRouter 8B
        "llama-3.1-8b-instant",                       # Groq 8B
        "deepseek-chat",                              # DeepSeek (paid)
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


def _has_key(client: OpenAI) -> bool:
    try:
        return bool(client.api_key) and client.api_key != _NOT_SET
    except Exception:
        return False


def _try_provider(client: OpenAI, model: str, kwargs: dict, label: str) -> "_TextResponse | None":
    """
    Single attempt at one provider. Returns response or None.
    On rate limit: marks provider as cooling and returns None immediately
    (caller handles waiting/retrying).
    """
    if not _has_key(client):
        return None
    if _is_cooling(label):
        return None
    try:
        r = client.chat.completions.create(model=model, **kwargs)
        content = r.choices[0].message.content
        if not content:
            return None   # reasoning-model with no tokens left for content
        return _TextResponse(content)
    except RateLimitError:
        _mark_cooling(label)
        return None
    except Exception as e:
        err_str = str(e)
        if "response_format is not supported" in err_str or "Venice" in err_str:
            # OpenRouter routing error — cool briefly, not a rate limit
            _mark_cooling(label, seconds=10.0)
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
    Provider order: Cerebras → OpenRouter → GroqCloud → DeepSeek.

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
    # Global test switch: LLM_TEST_GEMINI=1 in .env routes EVERY app call through the
    # isolated Gemini test provider — so you can exercise Gemini live in the webapp
    # without changing any call sites. Unset it (and restart) to revert to the chain.
    if os.getenv("LLM_TEST_GEMINI", "").lower() in ("1", "true", "yes"):
        gemini_only = True

    gm_model, cb_model, or_model, groq_model, ds_model = _MODELS.get(role, _MODELS["main"])

    kwargs: dict = dict(
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if want_json:
        kwargs["response_format"] = {"type": "json_object"}

    or_kwargs = dict(kwargs)
    if want_json:
        or_kwargs["extra_body"] = {"provider": {"require_parameters": True}}

    if gemini_only:
        # Isolated test path — ONLY the test Gemini, never the default chain.
        providers = [(_gemini, _GEMINI_TEST_MODEL, "Gemini(test)", kwargs)]
    elif cerebras_only:
        providers = [(_cerebras, cb_model, "Cerebras", kwargs)]
    else:
        # Default chain: Gemini → Cerebras → Groq → OpenRouter → DeepSeek.
        # Gemini and DeepSeek are PAID → excluded from free_only seeding jobs, which
        # then run Cerebras → Groq → OpenRouter (all free) only.
        providers = []
        if not free_only:
            providers.append((_gemini_main, gm_model, "Gemini", kwargs))
        providers += [
            (_cerebras,   cb_model,   "Cerebras",   kwargs),
            (_groq,       groq_model, "GroqCloud",   kwargs),
            (_openrouter, or_model,   "OpenRouter",  or_kwargs),
        ]
        if not free_only:
            providers.append((_deepseek, ds_model, "DeepSeek", kwargs))

    # Filter out providers with no key at all (permanent skip, not cooldown)
    configured = [(c, m, l, kw) for c, m, l, kw in providers if _has_key(c)]
    if not configured:
        raise RuntimeError("No LLM providers configured. Check API keys in .env.")

    while True:
        for client, model, label, provider_kwargs in configured:
            result = _try_provider(client, model, provider_kwargs, label)
            if result is not None:
                return result

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
