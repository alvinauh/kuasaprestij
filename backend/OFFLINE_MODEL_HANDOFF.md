# Offline model — handoff for the RTX 5070 PC Claude Code

Written 2026-10-27 from the VPS Claude Code session. Purpose: bring the PC session up to speed on the offline
model work. Source of truth is the repo on the VPS (`/root/kuasaprestij`): `slm_training/`, `scripts/`,
`WORKSPACE.md` (entry "2026-10-25 — Offline model first training run"), commits `eacd3a1` and `1fef9d8`.
Pull/copy the latest `slm_training/` from the VPS before doing anything — the PC copy may be stale.

## 1. What this is
Skor (KuasaPrestij) has an installable offline PWA. Offline, it runs a small LLM **in the browser** (Transformers.js,
WebGPU/WASM) for tutor chat, hints and gap-filling questions. Until now that was the **stock**
`onnx-community/Qwen2.5-0.5B-Instruct` q4 model, frozen, with no knowledge of our syllabus or question bank.
We now fine-tune it periodically and let the PWA self-update.

## 2. Decisions already made (user, 2026-10-25) — do not re-litigate
- **Base model: Qwen2.5-0.5B-Instruct.** Constraint is iPhone Safari memory/storage (~400-800 MB download). No 1.5B/3B.
  (Older text in `STATE_OF_APP.md` mentions a 1.5B GGUF / `slm/` / llama-server — that is the earlier, superseded plan.)
- **Training data is de-identified aggregates only:** no student IDs, names, session IDs or free text. A wrong option
  only gets its own hint example when >= 5 distinct students picked it (`min_students_k_anonymity` in `meta.json`).
- **Training runs on the user's PC** (this machine, RTX 5070), output is uploaded to the VPS. VPS has no GPU.
- Each run retrains from the **stock base** on the **full current dataset** (not incremental), so it tracks
  syllabus/bank changes.
- Eval gate: model must beat the stock baseline (held-out loss + JSON validity) or nothing is published.

## 3. Pipeline
```
VPS  scripts/export_slm_dataset.py      systemd timer, Sun 03:00 UTC -> data/slm/latest/ (train/eval jsonl + meta.json)
PC   slm_training/run_cycle.py          scp dataset -> train.py (LoRA) -> evaluate.py (gate) -> export_onnx.py (q4)
                                        -> scp to VPS data/offline_models/<version>/ -> ssh publish
VPS  scripts/publish_offline_model.py   checks eval.json passed, hashes files, writes data/offline_models/manifest.json
                                        (keeps manifest.prev.json; `--rollback` restores it)
VPS  app/main.py                        GET /offline_model/manifest, GET /offline_model/files/{version}/{path}
PWA  src/lib/offlineLlm.ts              maybeUpdateOfflineModel(): only on devices that already have a model, only on
                                        Wi-Fi / not data-saver; keeps old model if download fails
```
Run on PC: `set KP_HOST=root@<vps-ip>` then `python run_cycle.py` (`--no-publish` to stop after export).
**Do not run from `C:\WINDOWS\system32`** — use a user folder. Needs ssh key login to the VPS (scp + ssh).
Version string format: `v<YYYYMMDD>-<dataset_id>`.

Invariant: the prompts in `scripts/export_slm_dataset.py`, `slm_training/common.py`, and the frontend
`llm.worker.ts` / `offlineLlm.ts` must be **identical**. Change one, change all, or the model trains on wording the app never sends.

## 4. Current state (as of 2026-10-25 first run)
- First `run_cycle.py` on the Windows PC: LoRA training OK (294 steps, ~9 min); **eval passed**:
  eval_loss 2.21 -> 1.62, JSON-valid 63% -> 100% (60 generations, 172 eval examples).
- Merged model is on the PC at `work\v20261025-2026-10-25\merged`.
- **Failed at ONNX export:** `onnxruntime.quantization.matmul_4bits_quantizer` not found (newer onnxruntime renamed it to
  `matmul_nbits_quantizer` / `MatMulNBitsQuantizer`).
- **Fix committed on the VPS (1fef9d8), UNTESTED:** `slm_training/export_onnx.py` now try/excepts the import.
  The PC needs this updated file.
- Never run end-to-end yet: ONNX export, upload, publish, manifest serving, PWA loading a custom model in a real browser.

## 5. Next steps (in order)
1. Copy the updated `slm_training/export_onnx.py` (and ideally the whole folder) from the VPS to the PC.
2. Run `export_onnx.py --model work\v20261025-2026-10-25\merged --out work\v20261025-2026-10-25\publish` — no retrain.
   - If `MatMulNBitsQuantizer` rejects the args (it may want `bits=4` or a different signature in newer onnxruntime), adjust the call; pin the onnxruntime version in `requirements.txt` if easier.
   - `optimum.exporters.onnx` may also have changed CLI flags; check the `text-generation-with-past` task still works.
3. Sanity-check the output: `onnx/model_q4.onnx` plus `config.json`, `tokenizer.json`, `tokenizer_config.json`, `generation_config.json` (the exact set `publish_offline_model.py` requires). Expect roughly 400-800 MB.
4. Upload to `data/offline_models/<version>/` on the VPS and run `scripts/publish_offline_model.py <version>` (or re-run `run_cycle.py`; it retrains, so prefer doing the upload/publish steps by hand this time).
5. Verify `GET /offline_model/manifest` returns the version, then test the PWA update in a browser.
6. **Offline Cloud Run service (`kuasaprestij-offline`) must be redeployed** for the PWA-side update code to be live; that is blocked on `gcloud` login (VPS side, user must do it).

## 6. Known gaps / honest limits
- A 0.5B model improves at format, KSSM topics and tutoring tone; it will still make factual mistakes. Questions that matter offline come from the synced pack; the model is for hints and gaps.
- The gate measures JSON validity and held-out loss, **not factual correctness**.
- Loading a custom (non-HuggingFace) ONNX in Transformers.js was never tested in a browser.
- /submit_answer has been made idempotent for offline retries (commit b7848be), but verify the offline queue end to end.
- Since the PC has an RTX 5070 (Blackwell), make sure the installed PyTorch build supports it (CUDA 12.8+ wheels); the first run trained in ~9 min so this already works.

## 7. Sync rules between the two environments
- The VPS repo is canonical. Edit there, or send changes back and have them committed there; the monorepo is a mirror that `deploy/sync_and_deploy.sh` overwrites with `--delete`.
- Log outcomes in `WORKSPACE.md` (what changed, what's next, blockers). When the PC run finishes, paste the result (eval.json, manifest version, any errors) into the VPS session so both sides record it.
- The training work dir (`work\`), datasets and model weights are not in git (`.gitignore`d). Never commit weights or dataset files.
- No credentials in files. `KP_HOST` is an env var only.
