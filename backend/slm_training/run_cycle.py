"""One full cycle on the training PC:  pull dataset -> train -> eval gate -> ONNX q4 -> upload -> publish.

  set KP_HOST=root@<vps-ip>      (ssh key login; scp + ssh must work from this PC)
  python run_cycle.py            # whole cycle
  python run_cycle.py --no-publish   # stop after export (inspect first)
Schedule weekly, e.g. Windows Task Scheduler / cron: `python run_cycle.py` (the VPS rebuilds the dataset Sundays 03:00 UTC).
"""
import argparse, datetime, json, os, subprocess, sys

HOST = os.environ.get("KP_HOST")
REMOTE = os.environ.get("KP_REMOTE_DIR", "/root/kuasaprestij")
ap = argparse.ArgumentParser()
ap.add_argument("--work", default="work")
ap.add_argument("--no-publish", action="store_true")
ap.add_argument("--force-publish", action="store_true", help="publish even if the eval gate failed (not recommended)")
a = ap.parse_args()
if not HOST:
    sys.exit("set KP_HOST=root@<vps>")
py = sys.executable
run = lambda *c: subprocess.check_call(list(c))

data = os.path.join(a.work, "dataset")
os.makedirs(a.work, exist_ok=True)
os.makedirs(data, exist_ok=True)
run("scp", "-r", f"{HOST}:{REMOTE}/data/slm/latest/.", data)
meta = json.load(open(os.path.join(data, "meta.json")))
version = f"v{datetime.datetime.now(datetime.timezone.utc):%Y%m%d}-{meta['dataset_id']}"
out = os.path.join(a.work, version)
os.makedirs(out, exist_ok=True)
print("dataset", meta["dataset_id"], meta["train_examples"], "train /", meta["eval_examples"], "eval ->", version)

run(py, "train.py", "--data", data, "--out", out)
run(py, "evaluate.py", "--data", data, "--model", os.path.join(out, "merged"), "--out", os.path.join(out, "eval.json"))
ev = json.load(open(os.path.join(out, "eval.json")))
ev["dataset"] = meta
json.dump(ev, open(os.path.join(out, "eval.json"), "w"), indent=2)
if not ev["passed"] and not a.force_publish:
    sys.exit(f"eval gate FAILED, nothing published. See {out}/eval.json")

pub = os.path.join(out, "publish")
run(py, "export_onnx.py", "--model", os.path.join(out, "merged"), "--out", pub)
json.dump(ev, open(os.path.join(pub, "eval.json"), "w"), indent=2)
if a.no_publish:
    sys.exit(f"exported to {pub}; not published")
run("ssh", HOST, f"mkdir -p {REMOTE}/data/offline_models/{version}")
run("scp", "-r", os.path.join(pub, "."), f"{HOST}:{REMOTE}/data/offline_models/{version}/")
run("ssh", HOST, f"cd {REMOTE} && venv/bin/python3 scripts/publish_offline_model.py {version}" + (" --force" if a.force_publish else ""))
print("published", version)
