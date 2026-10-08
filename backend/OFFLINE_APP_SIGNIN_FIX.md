# Offline app: sign-in fix + follow-ups (2026-10-07, open)

Offline app: https://kuasaprestij-offline-746801891568.asia-southeast1.run.app/offline

## Problem

Signing in on the offline app doesn't bring you back to it. Supabase only redirects
to addresses on its allow list, and the offline app isn't on it. After **Continue
with Google**, an email-confirmation link or a password-reset link, Supabase sends
you to the Site URL (`https://api.kuasa.tech`, the main site) instead, so the offline
app stays signed out.

Checked: tapping "Sign in" on `/offline` does open the sign-in form (Chromium, iPhone
emulation, live URL). Email + password sign-in doesn't redirect, so it is not affected.

Current allow list (`uri_allow_list`, project `opavfcpsxnntjylipbwl`):

```
https://api.kuasa.tech/**
https://kuasaprestij-frontend-746801891568.asia-southeast1.run.app/**
http://localhost:3000/**
```

## Fix (to do)

Supabase dashboard → project `opavfcpsxnntjylipbwl` → **Authentication → URL
Configuration → Redirect URLs** → add, keeping the three above:

```
https://kuasaprestij-offline-746801891568.asia-southeast1.run.app/**
https://kuasaprestij-offline-u2vjywr5zq-as.a.run.app/**
```

Or via the Management API (`SUPABASE_ACCESS_TOKEN` in `.env`):
`PATCH https://api.supabase.com/v1/projects/opavfcpsxnntjylipbwl/config/auth` with
`{"uri_allow_list": "<all five, comma-separated>"}`. Claude's attempt was blocked by
the permission check; needs the user's approval or the dashboard.

**Workaround until then:** sign in on the offline app with email + password, not Google.

## Follow-ups in the app (not done, need a redeploy of `kuasaprestij-offline`)

1. After signing in from `/offline`, students are sent to the practice screen (`/`).
   Send them back to `/offline` so they can finish installing.
2. Mac Safari shows the wrong install step ("Open your browser menu and choose Install
   app"). It should say **File → Add to Dock** (Safari 17+). `isIos()` in
   `src/routes/offline.tsx` doesn't cover desktop Safari.
3. Optional: picture-by-picture install steps on `/offline`. On Apple devices there is
   no install button; users expect a download.

Redeploy after app changes (from `/root/kuasaprestij-monorepo`):
`gcloud builds submit frontend --config cloudbuild-offline.yaml --substitutions _TAG=$(git rev-parse --short HEAD)`

## How install is meant to work (for reference)

1. Open the link above; sign in while online.
2. iPhone/iPad Safari: Share → **Add to Home Screen** → Add. Chrome on iPhone: Share in
   the address bar. Mac Safari 17+: File → Add to Dock. Mac Chrome: install icon in
   the address bar.
3. Open Skor from the home screen / Dock, go to the Offline app page, tap **Download**
   under the question bank (~3 MB). On iPhone do this inside the home-screen app: iOS
   keeps its storage separate from Safari's.
4. Offline: open Skor → Free Practice. Answers sync when back online.
