# LLM Provider Analysis — Token Usage & Fallback Strategy

_Last updated: 2026-09-22_

---

## Token Consumption (successful calls, all-time)

| Provider | Model | Calls | Tokens In | Tokens Out | Total Tokens | Avg Latency | Success Rate |
|---|---|---|---|---|---|---|---|
| **GroqCloud** | qwen3.8-27b + gpt-oss | 328 | ~234k | ~337k | **570k** | 6–12s | 63% (rest rate-limit) |
| **OpenRouter** | nemotron-550B:free | 76 | 243k | 259k | **502k** | **161s avg** | 76% |
| **DeepSeek** | deepseek-chat | 150 | 167k | 135k | **302k** | 6–13s | **100%** |
| Gemini | gemini-3.7-flash | 133 | 0 | 0 | 0 | 1.8s | **0%** (always 402) |
| Cerebras | gpt-oss-120b | 258 | 0 | 0 | 0 | 0.2s | **0%** (always 402) |

> **Gemini and Cerebras have never worked** — both have been failing 100% of calls since Sep 7 when tracking started. Every request wastes ~2s burning through them before falling to Groq.

---

## Consumption by Pipeline Node (successful calls)

| Node | Provider | Calls | Total Tokens | Avg Latency | Notes |
|---|---|---|---|---|---|
| *(untraced — teacher chat / quiz gen)* | GroqCloud | 159 | 432k | 6.5s | Highest volume |
| `generator_node` | OpenRouter | 27 | 278k | **233s** | Adaptive question gen — heaviest per-call |
| *(untraced)* | DeepSeek | 142 | 247k | 6.5s | Reliable backup |
| `studio_node` | GroqCloud | 18 | 92k | 12s | Lesson/slide gen |
| `studio_node` | OpenRouter | 3 | 44k | **375s** | 6+ minutes per call |
| `generator_node` | DeepSeek | 4 | 36k | 21s | |
| `generator_node` | GroqCloud | 10 | 32k | 12s | |

**Biggest token spender:** `generator_node` — ~10k tokens/call for adaptive question generation grounded in DSKP context. The nemotron-550B OpenRouter model was regularly taking **6 minutes per generator_node call**.

**Sep 20 spike:** OpenRouter consumed 314k tokens in a single day (34 calls = seeding run hitting the fallback chain while Groq was rate-limited).

---

## What's Currently Broken

| Provider | Error | Root Cause | Fix |
|---|---|---|---|
| Cerebras | 402 payment_required | Free quota exhausted / billing needed | Top up at cerebras.ai/billing |
| Gemini | 402 RESOURCE_EXHAUSTED | Prepayment credits depleted | Top up at ai.studio/projects |
| OpenRouter old Llama | 404 not found | `meta-llama/llama-3.3-70b-instruct:free` removed from free tier | Fixed → now nemotron-3.5-lightning |

---

## Free Provider Alternatives

Ranked by suitability for this stack (OpenAI-compatible, ~10k token prompts, JSON output needed):

### 1. SambaNova Cloud ⭐ (best Cerebras replacement)
- **URL:** `https://api.sambanova.ai/v1`
- **Model:** `Meta-Llama-3.3-70B-Instruct`
- **Free tier:** 1M tokens/day — same offer as Cerebras used to be
- **Speed:** Sub-500ms inference — fastest free open-model provider
- **JSON output:** Clean, no chain-of-thought noise
- **Signup:** sambanova.ai → API → Get free key
- **Env var to add:** `SAMBANOVA_API_KEY`

### 2. Together AI (best paid fallback after DeepSeek)
- **URL:** `https://api.together.xyz/v1`
- **Model:** `meta-llama/Llama-3.3-70B-Instruct-Turbo`
- **Free:** $5 credit on signup, then ~$0.18/M tokens
- **Speed:** 1–2s for 70B
- **Signup:** api.together.ai
- **Env var to add:** `TOGETHER_API_KEY`

### 3. Fireworks AI (solid Groq alternative)
- **URL:** `https://api.fireworks.ai/inference/v1`
- **Model:** `accounts/fireworks/models/llama-v3p3-70b-instruct`
- **Free:** $1 credit on signup
- **Speed:** Fast, similar to Groq
- **Signup:** fireworks.ai
- **Env var to add:** `FIREWORKS_API_KEY`

### 4. Hyperbolic (GPU cloud, free tier)
- **URL:** `https://api.hyperbolic.xyz/v1`
- **Model:** `meta-llama/Llama-3.3-70B-Instruct`
- **Free:** $10 credit on signup
- **Signup:** app.hyperbolic.xyz
- **Env var to add:** `HYPERBOLIC_API_KEY`

---

## Recommended Chain Order (after adding SambaNova)

```
Gemini → SambaNova → GroqCloud → OpenRouter → DeepSeek
  (paid)     (1M/day)   (14.4k/day)  (free, slow)  (paid)
```

- Cerebras stays in code but is effectively dead until top-up
- SambaNova fills the "fast free" slot Cerebras vacated
- DeepSeek as last-resort paid provider (100% success, $0.28/M out)

---

## Immediate Priority

1. **Sign up for SambaNova** (free, 5 min) — restores fast inference immediately
2. **Top up Cerebras** ($5) — 1M tokens/day, the fastest provider of all
3. **OR top up Gemini** (add prepay credits) — paid but flexible, no daily cap

**Daily token budget at current load (~50 sessions/day):**
- ~1,500 tokens/session × 50 = ~75k tokens/day needed
- SambaNova free tier (1M/day) covers 13× current load alone
