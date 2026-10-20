# VPS handoff — 2026-10-20: apply the offline work and the new notes to the live folders

**For the Claude Code session on the VPS (`ubuntu-8gb-nbg1-1`).** Another Claude session on the user's
Windows PC built changes on GitHub but cannot reach this server. The live folders here are the master
copy (`deploy/sync_and_deploy.sh` rsyncs them over the monorepo with `--delete`), so the changes only
count once they are in `/root/kuasaprestij` and `/root/frontend/learn-play-shine-96`. Your job: apply
them carefully, commit them in the live repos, check the site, and hand back the few steps only the
user can run.

Read `/root/kuasaprestij/CLAUDE.md` (work rules) and the top of `WORKSPACE.md` first.

## What this is

Four commits on GitHub (`alvinauh/kuasaprestij`), on top of `f5e735b` (GitHub `main` after the
2026-10-08 sync):

| Commit | Branch / PR | What |
|---|---|---|
| `8553882` | `offline-slm` / PR #1 | fine-tuned offline AI wiring, duplicate-safe sync (`client_attempt_id`), question-pack refresh |
| `b3b3413` | `offline-signup` / PR #2 | offline sign-up for students, signed `/submit_answer` |
| `dcba492` | `offline-signup` / PR #2 | online sign-up says "this email already has an account" |
| `f21010d` | `offline-signup` / PR #2 | notes: WORKSPACE.md (3 entries), STATE_OF_APP §8j, CLAUDE.md, OFFLINE_* docs |

Whether the PRs are merged yet doesn't matter: the patches below come from the commits themselves.

**Files that change on the live folders** (tested: the two patches apply cleanly to the 2026-10-08 files
and reproduce the branch exactly):

- `/root/kuasaprestij` (9 files, ~26 KB patch): `app/main.py`, `agents/orchestrator.py`,
  `schema/offline_sync.sql` (new), `CLAUDE.md`, `STATE_OF_APP.md`, `WORKSPACE.md`,
  `OFFLINE_INSTALLABLE_PLAN.md`, `OFFLINE_APP_SIGNIN_FIX.md`, and a deletion of the empty junk file
  `**Task:**` (its name breaks checkouts on Windows).
- `/root/frontend/learn-play-shine-96` (13 files, ~439 KB patch, mostly `public/offline/fact_cards.json`):
  `src/lib/{auth.tsx,offlineAccounts.ts,offlineDb.ts,offlineLlm.ts,offlinePacks.ts,syncQueue.ts}`,
  `src/lib/slm/{index,prompts,runtime}.ts`, `src/hooks/useOnlineSync.ts`, `src/routes/login.tsx`,
  `src/services/api.ts`, `public/offline/fact_cards.json`.
- Not for the VPS: `slm/` (training pipeline, field-test reports) and the root `README.md` live only in
  the monorepo and survive the sync.

## Already done on this server (by the user; don't redo)

| What | Where |
|---|---|
| DNS `skor.space`, `www`, `api` → this server | Namecheap |
| Caddy block `skor.space, www.skor.space, api.skor.space → 172.18.0.1:8445` + Let's Encrypt certs | `/root/thesissifu_project/Caddyfile` (backup `Caddyfile.bak-before-skor`) |
| `VITE_API_BASE_URL`, `VITE_API_URL`, `VITE_APP_URL` → `skor.space` names | `/root/frontend/learn-play-shine-96/.env` (backup `.env.bak-before-skor`; service restarted) |
| CORS `allow_origin_regex` + `skor.space` names | `/root/kuasaprestij/app/main.py` (**uncommitted**; backup `main.py.bak-before-skor`; API restarted) |
| Supabase Site URL + Redirect URLs for `skor.space` | dashboard |

Details are in the top `WORKSPACE.md` entry ("Domain moved from kuasa.tech to skor.space").

## Guardrails

- **Never print or commit secrets.** Don't `cat` any `.env`. Stage files **by name** (`git add <file>`),
  never `git add -A` / `git commit -a`: `.env.bak-before-skor` and `main.py.bak-before-skor` must stay out.
- **Don't push to GitHub and don't run `deploy/sync_and_deploy.sh`.** The user runs those (see §6).
- **Frontend edits go live instantly** (Vite dev + HMR, everyone on skor.space). Get the user's explicit
  go-ahead before applying the frontend patch (§4).
- Don't touch `/root/thesissifu_project` (other projects), the CORS lines, or `.env` values.
- If a hunk doesn't apply, **don't force it** (`--reject`, `-3`, `-C0`). Apply that hunk by hand and keep
  the live code. The VPS backend is ahead of GitHub: `app/main.py`, `agents/document_extractor.py` and
  `deploy/nginx-standalone.conf` changed on 2026-10-15 and exist only in this server's git history.
- If your permissions block `systemctl restart`, ask the user to run it with `!`.

## Steps

### 0. Restore points (read-only)
```
git -C /root/kuasaprestij status --short; git -C /root/kuasaprestij rev-parse --short HEAD
git -C /root/frontend/learn-play-shine-96 rev-parse --is-inside-work-tree
git -C /root/frontend/learn-play-shine-96 status --short | head; git -C /root/frontend/learn-play-shine-96 rev-parse --short HEAD
```
Note the two HEADs for the rollback. If the frontend folder is not a git repo, skip its commit step.

### 1. Make the patches
```
cd /root/kuasaprestij-monorepo && git fetch origin offline-slm offline-signup
git log --oneline f5e735b..f21010d          # expect exactly 4 commits (8553882 b3b3413 dcba492 f21010d)
git diff f5e735b f21010d -- backend  > /tmp/skor-backend.patch
git diff f5e735b f21010d -- frontend > /tmp/skor-frontend.patch
wc -l /tmp/skor-backend.patch /tmp/skor-frontend.patch    # expect 264 and 13079
```
`git fetch` doesn't touch the monorepo's working tree. (The two-point diff is independent of where
GitHub `main` has moved.)

### 2. Tell the user what the VPS has that GitHub doesn't (read-only)
```
git -C /root/kuasaprestij log --since=2026-10-08 --format='%h %ci %s' --stat | head -40
```
Report it: the PC-side Claude wants to know what the 2026-10-15 changes were.

### 3. Backend (`/root/kuasaprestij`)
1. Commit the CORS change on its own first: `git add app/main.py` (only the CORS edit is in it now) →
   `git commit -m "fix(cors): allow skor.space, www.skor.space and api.skor.space"`.
2. Code: `git apply -p2 --check --exclude='*.md' /tmp/skor-backend.patch`. If it says nothing, apply it
   without `--check`. If it fails on `app/main.py`, show the user the failing hunk and merge it by hand
   (what the hunks do is in §8). If **only** the `**Task:**` deletion fails, confirm it is empty with
   `ls -l` and remove it with `rm -- '/root/kuasaprestij/**Task:**'`, then re-run.
3. `/root/kuasaprestij/venv/bin/python -m py_compile app/main.py agents/orchestrator.py` must pass.
4. Commit by name: `app/main.py agents/orchestrator.py schema/offline_sync.sql` (+ the deleted junk file)
   — message: `feat(api): idempotent offline answers and a signed /submit_answer (SUBMIT_ANSWER_AUTH)`.
   `schema/offline_sync.sql` is already applied in Supabase (2026-10-18); do not run it again.
5. Notes: `git apply -p2 --check --include='*.md' /tmp/skor-backend.patch`, then apply. **Expected problem:**
   `WORKSPACE.md` was edited here after the last sync (2026-10-08 06:36), so its hunk may fail. Then
   apply the other four notes files and add the three new entries to the top of `WORKSPACE.md` by hand:
   copy them from `git -C /root/kuasaprestij-monorepo show f21010d:backend/WORKSPACE.md` (everything between
   the first `---` and the old first entry "🎯 AI Controller") and update the "Last updated" line.
   Commit: `docs: record the offline SLM, offline sign-up and the skor.space move`.
6. Restart the API: **`! systemctl restart kuasaprestij`** (user), then
   `systemctl is-active kuasaprestij` and `curl -s -o /dev/null -w '%{http_code}\n' https://api.skor.space/docs` → 200.

`SUBMIT_ANSWER_AUTH` stays unset (= `warn`: requests without a token are only logged). Do not set
`enforce` yet.

### 4. Frontend (`/root/frontend/learn-play-shine-96`) — **ask the user first**
Say: "Applying this changes sign-in, sign-up and answer sending for everyone on skor.space immediately.
Go ahead?" Then:
1. `git apply -p2 --check /tmp/skor-frontend.patch` → apply.
2. `journalctl -u kuasaprestij-frontend -n 40 --no-pager` shows no new errors; `npx tsc --noEmit` shows
   only the existing `vite.config.ts` `noExternals` error.
3. Load `https://skor.space/login` (sign-in page renders; "Sign up" works).
4. If it is a git repo, commit by name (`src/…`, `public/offline/fact_cards.json`):
   `feat(offline): offline AI wiring, offline sign-up, duplicate-safe signed answer sync`.

### 5. Smoke test (with the user)
- Sign in with an existing student account on `https://skor.space`; classes and history load.
- Answer one practice question: succeeds, and a new `event_logs` row appears.
- `journalctl -u kuasaprestij -n 80 --no-pager | grep -c 'submit_answer without a token'` — a few are
  fine (old app builds); a student on the new build sends a token.
- Sign up on the login page with an existing email: it says "This email already has a Skor account".
- `systemctl is-active kuasaprestij kuasaprestij-frontend kuasaprestij-nginx` → all `active`.

### 6. Hand back to the user (they run these; you don't)
1. If PRs #1 and #2 were merged on GitHub: `cd /root/kuasaprestij-monorepo && git pull --ff-only origin main`
   (otherwise the sync's `git push origin main` is rejected). If they were **not** merged, the sync will
   put the same content on `main` and the PRs become redundant: close them as "superseded by sync".
2. `/root/kuasaprestij/deploy/sync_and_deploy.sh --skip-gcp --message "deploy: offline AI, offline sign-up, skor.space"`
   — `--skip-gcp` on purpose: the Cloud Run builds still bake in `https://api.kuasa.tech`; the PC-side
   Claude is preparing the `cloudbuild-*.yaml` changes, redeploy after those.
3. Then tell the PC-side Claude (paste your report) so it can update the PRs and notes.

### 7. Rollback
Backend: `git -C /root/kuasaprestij revert <commit>` for the commits above, then `! systemctl restart kuasaprestij`.
Frontend: `git revert` the frontend commit (HMR reloads it) or `git apply -R -p2 /tmp/skor-frontend.patch`.
The restore points are from step 0.

## 8. What the changes do (to judge hunks)

- **`SubmitAnswerRequest`** gains optional `client_attempt_id`, `answered_at`, `model_version`,
  `provisional`. **`submit_answer`**: an attempt id already in `event_logs` returns `{"duplicate": true, …}`
  without re-marking; `offline-…` student ids get 400; a bearer token, if sent, must belong to the student
  (or their teacher / an admin) and a quiz session must belong to the caller (`_answer_caller`,
  `SUBMIT_ANSWER_AUTH`). **`mastery_updater_node`** writes the offline fields into `event_logs`
  (`client_attempt_id`, `source='offline'`, `model_version`, `provisional`, `created_at`).
- **Frontend:** the app sends `Authorization: Bearer …` with answers (`api.ts`, `syncQueue.ts`); the queue
  only sends the signed-in student's answers and keeps them on a 401; students can sign up with no
  internet (account stays on the device until they finish it online and confirm their email; Supabase
  requires confirmation); online sign-up reports an existing email; the offline question pack refreshes
  after a sync; the on-device AI (`src/lib/slm/*`) is used only where a local model server or the
  Android plugin exists, so on the website that part has no effect (the other changes above do apply).

## 9. Not part of this handoff (still open)

- Google Classroom callback (`api.kuasa.tech:8443/google/callback`) in the API's `.env` + Google Cloud console.
- `aita.kuasa.tech` → `aita.skor.space` Caddy block; `cloudbuild-offline.yaml` / `cloudbuild-frontend.yaml`
  API address; the two Cloud Run offline URLs in Supabase Redirect URLs (user, dashboard).
- Later: `SUBMIT_ANSWER_AUTH=enforce` once the logs stay clean; remove `*.kuasa.tech` from the CORS regex;
  the empty `question_cache` table in Supabase is unused (leave it or drop it).
