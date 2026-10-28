#!/usr/bin/env python3
"""
Publish a trained offline model so the PWA can pick it up.

  data/offline_models/<version>/   config.json tokenizer*.json generation_config.json
                                   onnx/model_q4.onnx  eval.json   (uploaded from the training PC)
  data/offline_models/manifest.json   written here: the version the PWA should run + file hashes

Refuses to publish unless eval.json says the model beat the baseline (--force overrides).
The previous manifest is kept as manifest.prev.json for one-command rollback (--rollback).
"""
import argparse, hashlib, json, os, shutil, sys
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "offline_models")
REQUIRED = ["config.json", "tokenizer.json", "tokenizer_config.json", "generation_config.json", "onnx/model_q4.onnx"]


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("version", nargs="?")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    a = ap.parse_args()
    cur, prev = os.path.join(ROOT, "manifest.json"), os.path.join(ROOT, "manifest.prev.json")

    if a.rollback:
        if not os.path.exists(prev):
            sys.exit("no manifest.prev.json to roll back to")
        shutil.copy(prev, cur)
        print("rolled back to", json.load(open(cur))["version"])
        return
    if not a.version:
        sys.exit("usage: publish_offline_model.py <version> [--force] | --rollback")

    d = os.path.join(ROOT, a.version)
    missing = [f for f in REQUIRED if not os.path.exists(os.path.join(d, f))]
    if missing:
        sys.exit(f"missing files in {d}: {missing}")
    ev = {}
    if os.path.exists(os.path.join(d, "eval.json")):
        ev = json.load(open(os.path.join(d, "eval.json")))
    if not ev.get("passed") and not a.force:
        sys.exit(f"eval.json missing or not passed ({ev or 'absent'}); fix or use --force")

    files = {}
    for f in REQUIRED:
        p = os.path.join(d, f)
        files[f] = {"bytes": os.path.getsize(p), "sha256": sha(p)}
    manifest = {
        "version": a.version,
        "base_model": "Qwen2.5-0.5B-Instruct",
        "published_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dtype": "q4",
        "total_bytes": sum(v["bytes"] for v in files.values()),
        "files": files,
        "eval": ev,
    }
    if os.path.exists(cur):
        shutil.copy(cur, prev)
    tmp = cur + ".tmp"
    json.dump(manifest, open(tmp, "w"), indent=2)
    os.replace(tmp, cur)          # atomic: the PWA never sees a half-written manifest
    print("published", a.version, f"({manifest['total_bytes'] / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
