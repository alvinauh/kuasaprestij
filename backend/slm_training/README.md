# Offline model training (runs on your PC)

Weekly loop: VPS builds a **de-identified** dataset (Sundays 03:00 UTC) → this PC trains a LoRA on
Qwen2.5-0.5B-Instruct → eval gate vs the stock model → ONNX q4 → upload → VPS publishes a manifest →
the offline PWA downloads the new model next time it is online on Wi-Fi.

## One-time setup
1. Python 3.10+, ideally an NVIDIA GPU with ≥8 GB VRAM (CPU works but takes hours).
2. `pip install -r requirements.txt`
3. ssh key login to the VPS; `set KP_HOST=root@<vps-ip>` (Windows) / `export KP_HOST=...`.

## Each run
`python run_cycle.py` — pull → train → eval → export → upload → publish. Use `--no-publish` to inspect first.
Rollback: `ssh $KP_HOST "cd /root/kuasaprestij && venv/bin/python3 scripts/publish_offline_model.py --rollback"`.

## What is (and is not) in the data
- In: the quality-gated question bank (grounded in the DSKP syllabus), why-correct/distractor explanations,
  and per-question wrong-answer statistics. Hard questions (many students wrong) are repeated up to 3x.
- Never in: student IDs, names, session IDs, free text. A wrong option only gets its own hint example when
  ≥5 distinct students picked it (`min_students_k_anonymity` in meta.json).
- Each run retrains from the stock base on the current full dataset, so it follows syllabus/bank changes.

## Honest limits
- A 0.5B model gets better at format, KSSM topics and tutoring tone; it will still make factual mistakes.
  Offline questions that matter come from the synced pack; the model is for gaps and hints.
- The gate checks JSON validity and held-out loss, not factual correctness of generated questions.
- The prompts in `scripts/export_slm_dataset.py` and `common.py` must match `llm.worker.ts` / `offlineLlm.ts`.
  Change one → change all, or the model is trained on wording the app never sends.
