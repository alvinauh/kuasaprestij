"""Run the whole Skor SLM pipeline with one command; stops at the first failure.

  python run_all.py                 # env check -> export -> distill -> train -> validate
  python run_all.py --from train    # resume from a step
  python run_all.py --dry-run       # print the commands only

Steps whose output already exists are skipped unless --force is given.
Distillation runs a local teacher model on the GPU (scripts/distill_local.py); no external API.
"""
import argparse
import glob
import os
import subprocess
import sys
import time

PY = sys.executable
DATA = "data/skor_slm_dataset.jsonl"   # Supabase export
TRAIN = "data/skor_slm_train.jsonl"    # export + local distillation
GGUF_DIR = "skor_offline_slm"


def gguf():
    found = sorted(glob.glob(f"{GGUF_DIR}*/*.gguf") + glob.glob(f"{GGUF_DIR}*.gguf"))
    return found[0] if found else None


def steps(model):
    return [
        ("env", [PY, "scripts/check_env.py"], lambda: False),
        ("export", [PY, "scripts/export_supabase_training_data.py", "--out", DATA],
         lambda: os.path.exists(DATA)),
        ("syllabus", [PY, "scripts/syllabus_cache.py"], lambda: os.path.exists("data/syllabus/chunks.jsonl")),
        ("cards", [PY, "scripts/build_fact_cards.py"], lambda: os.path.exists("data/fact_cards.json")),
        ("distill", [PY, "scripts/distill_v2.py", "--seeds", DATA, "--train-out", TRAIN],
         lambda: os.path.exists(TRAIN)),
        ("train", [PY, "train_skor_slm.py", "--model", model, "--data", TRAIN, "--out", GGUF_DIR],
         lambda: gguf() is not None),
        ("validate", None, lambda: False),  # command built at run time (needs the GGUF path)
    ]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="unsloth/Qwen2.5-1.5B-Instruct")
    p.add_argument("--from", dest="start", default="env",
                   choices=["env", "export", "syllabus", "cards", "distill", "train", "validate"])
    p.add_argument("--force", action="store_true", help="re-run steps even if output exists")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    plan = steps(args.model)
    names = [s[0] for s in plan]
    t_all = time.time()

    for name, cmd, done in plan[names.index(args.start):]:
        if name == "export" and not args.dry_run and not os.path.exists(DATA) and not (
                os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
            sys.exit("export: set SUPABASE_URL and SUPABASE_SERVICE_KEY first")
        if done() and not args.force:
            print(f"== {name}: output exists, skipping (use --force to redo)")
            continue
        if name == "validate":
            model_file = gguf()
            if not model_file and not args.dry_run:
                sys.exit("validate: no .gguf found - did training finish?")
            cmd = [PY, "scripts/validate_gguf.py", "--model", model_file or f"{GGUF_DIR}/<model>.gguf",
                   "--threads", "4"]

        print(f"\n== {name}: {' '.join(cmd)}", flush=True)
        if args.dry_run:
            continue
        t0 = time.time()
        rc = subprocess.call(cmd)
        print(f"== {name}: exit {rc} after {time.time() - t0:.0f}s", flush=True)
        if rc != 0:
            sys.exit(f"stopped at '{name}'. Fix the error above, then: python run_all.py --from {name}")

    print(f"\nAll steps done in {(time.time() - t_all) / 60:.1f} min")


if __name__ == "__main__":
    main()
