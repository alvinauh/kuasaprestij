# CLAUDE.md - KuasaPrestij (Skor) Offline SLM Integration

## 1. System Context & Hardware Architecture
- **Target application:** Offline engine for Skor (KuasaPrestij), an AI-driven adaptive assessment and teaching platform for Malaysian secondary schools (KSSM/SPM).
- **Languages:** Bahasa Melayu (BM), English (EN), Mandarin (ZH).
- **Workstation (training):** AMD desktop + NVIDIA RTX 5070 (12 GB VRAM, Blackwell `sm_120`), CUDA 12.8+, PyTorch `cu128` build.
- **Client (inference):** Android phone running the Capacitor APK with a native `llama.cpp` runtime.
  - The USB OTG drive is for **distributing** the `.gguf` and content packs. On first launch the app copies the model into internal app storage; `llama.cpp` cannot reliably mmap from OTG storage.
  - IndexedDB `skor-v2` lives in the WebView's internal storage. It cannot be hosted on the USB drive.
- **Core architecture shift:** Replace the online chain (`deepseek-chat` -> `gemini` -> `groq`) with an on-device Qwen2.5-1.5B-Instruct (3B for high-end phones) quantized to `Q4_K_M` GGUF. Use the cloud chain only when online, for verification.

## 2. Core SLM Tasks & Schemas
The fine-tuned model must output JSON matching `schemas/assessment.py` (in the Skor repo; `scripts/schemas.py` here is a local mirror and must be kept in sync):
1. **`evaluator_node`** (short answer & MCQ explanation): `student_feedback`, `teacher_insight {error_category, root_cause_analysis, actionable_intervention}`.
2. **`offlineTutorReply`** (SEDA chat): 1–3 sentence hint using a SEDA move (`invite_reasoning`, `explain_reasoning`, `build_on_ideas`), ending with an open question.
3. **`generator_node`** (adaptive KBAT MCQ): valid `MCQQuestion` JSON (`question`, 4 `options`, `distractor_rationale`, `stimulus`, `object_lesson`), used only when local `topic_anchors` for a topic are exhausted.
4. **`offlineEssayEvaluator`** (asynchronous): Pass 1 → `band` + `score`; Pass 2 → `strengths` + `improvements`.

Every training example is tagged with `task` and `lang` so the dataset can be balanced and evaluated per task/language.

## 3. Asynchronous Offline Essay Grading & Throttle Rules
- **Non-blocking:** Offline essays go into the `sync_queue` store in IndexedDB (`skor-v2`) and are graded by a background worker.
- **User notice:** *"Offline Essay Grading Notice: Processing on-device. Takes ~45–90s. You can continue practising other topics while it runs in the background."*
- **Throttling:** `llama.cpp` uses 2–4 threads at low priority, off the UI thread, so the phone doesn't overheat and the UI doesn't stutter.
- **Two-tier truth model:** Local results carry `is_provisional = true` and show *"Provisional Grade (Offline)"* until the device syncs and the cloud engine confirms the final mastery statistics.

## 4. Supabase Data Extraction & Dataset Strategy
- **Sources:**
  - `topic_anchors` (1,141 rows): cached MCQs, distractor rationales, worked examples, mnemonics.
  - `syllabus_embeddings` (28,705 chunks): DSKP texts. Use these as **grounding context inside prompts**, not as raw training targets.
  - `event_logs` (397 rows): real student errors with `error_category` and `root_cause_analysis`.
- **Privacy (PDPA 2010):** `event_logs` contain real student work. Strip names, IDs, emails and school identifiers *before* anything is written to disk or sent to a teacher model.
- **Distillation:** Use teacher models (DeepSeek/Claude) to generate synthetic short-answer evaluations, SEDA tutor turns and essay gradings, and to fix the Mandarin deficit (currently 15 ZH rows). Target at least ~20% ZH per task.
- **Output:** `data/skor_slm_dataset.jsonl`, one JSON object per line:
  `{"task": "...", "lang": "bm|en|zh", "messages": [{"role":"system",...},{"role":"user",...},{"role":"assistant",...}]}`.
  The assistant message is the exact JSON string the app expects. ChatML text is produced by `tokenizer.apply_chat_template` in the training script; never hand-write `<|im_start|>` strings.

## 5. Workstation Fine-Tuning (`train_skor_slm.py`)
- Unsloth 4-bit QLoRA, r=16, gradient checkpointing (`"unsloth"`), TRL `SFTConfig` (current TRL API: `processing_class=`, not `tokenizer=`).
- Loss only on assistant tokens (`train_on_responses_only`).
- Holds out 5% as an eval split, trains by epochs (not a fixed 200 steps), and saves both the LoRA adapter and the `Q4_K_M` GGUF.
- Run: `python train_skor_slm.py --model unsloth/Qwen2.5-1.5B-Instruct`.

## 6. GBNF Grammar Constraints
Grammars in `grammars/` constrain `llama.cpp` output so small models cannot emit malformed JSON:
- `essay_pass1.gbnf` → `{"band": "A".."D", "score": 0-100}`
- `essay_pass2.gbnf` → `{"strengths": [1-5 strings], "improvements": [1-5 strings]}`

Grammar strings use full JSON escaping, and whitespace is bounded so generation can't run forever. Grammars guarantee *syntax* only; values are still checked with the Pydantic schemas.

## 7. Current Pipeline (WSL2 Ubuntu, `~/skor_slm`; `run_all.py` runs it end to end)
`env` → `export` (Supabase) → `syllabus` (DSKP/textbook text cache) → `cards` (`build_fact_cards.py`: per-topic
BM/EN/ZH fact cards, local embedder + local teacher) → `distill` (`distill_v2.py`: local Qwen3-8B teacher, no
external API) → `train` (GGUF via local llama.cpp in `~/llama.cpp`; Unsloth's own GGUF export hangs on sudo) →
`validate`.
- Prompts and system strings live in `scripts/prompts.py`, mirrored in `frontend/src/lib/slm/prompts.ts`;
  change both together. The app puts `cardText(fact card, lang)` in the prompt as `Context:`; cards ship as
  `frontend/public/offline/fact_cards.json` (copy of `data/fact_cards.json`).
- Runtime (`frontend/src/lib/slm/runtime.ts`): Android APK -> Capacitor plugin `SkorLlm` (llama.cpp, not built
  yet); Windows/lab PC -> `slm/serve.sh` (llama-server on 127.0.0.1:8088); plain browser -> no offline AI.
  Tasks in `frontend/src/lib/slm/index.ts`: tutor, short written answers, essays. MCQs stay on markOffline().
- Field testing: `scripts/field_test.py`, `scripts/probe.py`, persona reports in `field_test/`,
  v1-vs-v2 numbers in `field_test_v2/RESULTS.md`.
- Known gaps: offline essay bands are barely above baseline (needs teacher-graded calibration data);
  generated MCQ keys are unreliable (never generate for students offline); the tutor can still say
  "Kamu betul" to a wrong idea on later turns; essay pass 2 sometimes adds the injection-fix line
  ("Remove text that is not part of the essay") to clean essays; BM/ZH fact-card terms need teacher review.
