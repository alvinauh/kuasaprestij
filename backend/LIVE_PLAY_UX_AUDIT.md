# Live Play UX Audit — joining games, watching, challenging

> Written 2026-10-03. Scope: how a student joins a Kahoot-style game, sees live
> activity, or challenges someone in Skor, plus what stops it from feeling seamless.

## Where each thing lives today

| User wants to… | Where | Status |
|---|---|---|
| Join a game (Kahoot-style) | Teacher: My Classrooms → **Live Arena** (projector screen with QR). Player: QR → `/join?code=<invite_code>` → name → student home; rounds open automatically | Works, but only if the teacher shares the link |
| Join from inside the app | Study Mode screen → **Join Class** card (invite code) | Separate flow from `/join`; doesn't receive live rounds until reload (bug 2) |
| See a live round in progress | Amber **"Live Quiz Active! — Join →"** banner on the home and practice screens | Works |
| Challenge the class | Practice screen → violet **"⚡ Challenge Your Class"** | Round never ends (bug 1) |
| Challenge one person | — | **Doesn't exist.** The "X is studying now → Race →" card only loads the same topic locally |
| Watch others answer | — | **Doesn't exist.** The only signs of classmates are the loading-game racer strip and the answer list inside a round you're already in |

## Bugs (fixing first)

1. **Student challenge rounds never close.** `ChallengeClassModal` → `/classroom_live/start`;
   only the teacher's Live Arena panel ever calls `/classroom_live/end`, and the server has
   no timer that closes rounds. Effects: the answer reveal never shows (it waits for `ended`,
   `LiveQuizView.tsx`), the row stays `active` forever, every classmate sees "Live Quiz
   Active!", late joiners pop into a dead round, and "Challenge Your Class" stays hidden.
2. **In-app Join Class doesn't connect you to live rounds.** `useLiveSession` fetches
   classroom membership once on mount; `handleJoinClass` never refreshes it, so there are no
   rounds and no lobby presence until reload.
3. **A student can end the teacher's round.** `/classroom_live/start` always calls
   `_end_active_rounds` and trusts `teacher_id` from the body. A student challenge sent while
   an arena round runs (stale UI or direct API call) kills the teacher's round mid-arena.
4. **Dead "correct ✓" highlight in the challenge preview.** `/start_session` strips the key,
   so `generated.correct` is always empty. Harmless, since the launcher shouldn't see it,
   but misleading. The challenge modal also hard-codes `"English"`.

## UX friction

- **No way in without the link.** There's no "Join a game" on the login page and no short
  PIN. The code is the permanent 8-char class invite code (e.g. `c7b2eecf`), hard to read off
  a projector, and it never expires, so old codes keep creating guest accounts in real classes.
- **Guests land on the full student home** (Diagnostic / Assigned Tasks / Free Practice /
  Join Class) with no "You're in, waiting for host…" state.
- **Two join flows** (`/join` QR + guest vs the in-app Join Class card) behave differently.
- **Closing a round loses it.** After ✕, the only way back is a banner that appears on some
  screens; there's no persistent "live" indicator in the header.
- **Challenge modal is awkward:** the topic defaults to the current practice topic (can be blank),
  it only targets `classroomIds[0]`, and the 5–10 s generation wait has no pick-from-bank option.
- **Racer strip / "studying now" are social in name only.** There's no notification to the other
  person, no shared start, and no result.
- **The leaderboard isn't live** (30 s poll, all-time, by subject).

## Target "seamless" design

1. One **Play** entry (login page + home header): PIN or scan → name → **waiting screen**
   with avatar shown on the projector. Replaces both join flows.
2. **Short per-session PINs** issued when Live Arena opens, expired when it closes.
3. **Server-enforced round deadlines**: rounds close themselves at
   `started_at + duration_s`.
4. **Student duels** as their own rooms (pick classmate or "anyone" → accept toast → same 5
   questions → result), never touching the class-wide round.
5. **"Live now" section** on home: ongoing rounds/duels to join or watch, with answer counts.

## Fix log

- [x] Bug 1 — server sweep closes expired rounds (`_live_round_sweeper`, 5 s grace past
      `started_at + duration_s`); students' clients also call `/classroom_live/expire/{id}`
      at 0 s so the reveal is immediate.
- [x] Bug 2 — `useLiveSession` exposes `refreshClassrooms()`; called after a successful
      in-app Join Class.
- [x] Bug 3 — `/classroom_live/start` + `start_game`: only the classroom's teacher (or an
      admin) may replace an active round; anyone else gets 409 while one is running.
      Student challenges must be classroom members.
- [x] Bug 4 — dead answer highlight removed; challenge uses the student's language.
- [ ] Bearer-token auth on `/classroom_live/*` (`teacher_id` is still taken from the body)
- [x] Play entry + PIN + waiting screen (2026-10-03: `/join` = PIN or class code → name → waiting room; projector shows PIN; links on login + student home)
- [ ] Student duels
- [x] "Live now" section (2026-10-03: student home lists running rounds with counts/time left → Join/Watch, open arenas via host presence → Enter lobby, studying classmates → Race, PIN row)
