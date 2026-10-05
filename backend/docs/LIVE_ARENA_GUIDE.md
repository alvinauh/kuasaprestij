# Live Arena: teacher guide

How to run a live class competition: a set of quiz questions followed by a game battle, started with one button.
Live site: https://api.kuasa.tech:8443 (always use `:8443`; plain `api.kuasa.tech` is a different app).

## Run a match

1. **Open the arena.** On the teacher dashboard, go to **My Classrooms** and click the orange **Live Arena** button on the class. It opens full screen, ready for the projector. If you have no class yet, click **New classroom** first.
2. **Get students in.** The arena shows a **QR code** and a **6-digit game PIN**. Students scan the QR code, or go to `https://api.kuasa.tech:8443/join` and type the PIN. Guests can join without an account. Joined players appear under **In the lobby**.
3. **Set up the match** on one panel:

   | Setting | Options |
   |---|---|
   | Form | Form 1–5 |
   | Subject | KSSM subject list; defaults to the class's subject |
   | Language | BM / English. **Locked** for language subjects: Bahasa Inggeris is always English, Bahasa Melayu always BM |
   | Topic | That subject's KSSM topics |
   | Number of questions | None / 3 / **5** (default) / 8 / 10; 20 seconds each |
   | Game battle | **🦕 Dino Run**, **🐦 Flappy Bird**, **⭐ Catch Stars** or No game; plays after the questions |
   | Game length | 30 / 60 / 90 seconds |

   A summary line shows the plan, e.g. *"5 questions → 60s Dino Run · about 4 min · 12 players in the lobby"*.
4. **Press Prepare match.** All questions are prepared at once. It takes a second or two when the topic has enough cached questions, and 10–40 seconds when some have to be generated.
5. **Press Start game when your class is in.** The ready screen shows how many players are in the lobby. **Start game** stays disabled ("Waiting for players to join…") until at least one player has joined, and more can join until you press it. **Back to setup** changes the settings.
6. **The match runs itself:**
   - question (20 s) → answer and results → 8-second "Up next" countdown → next question → … → Dino Run battle → **Match complete!**, showing the quiz champion and the game champion;
   - a question round closes early once every player in the lobby has answered;
   - the progress bar at the top shows where you are (purple = questions, amber = game).
7. **While it's running:**
   - **Pause** stops the countdown between rounds (Resume continues).
   - **Next now** skips the wait and starts the next round straight away.
   - **End round now** (during a round) closes it immediately.
   - **End match** stops after the current round.
8. **Afterwards:** click **Set up another match**. Each new match starts both leaderboards from zero.

## Scoring

- **Question points:** 0 for a wrong answer; a correct answer scores 500 plus up to 500 for speed.
- **Game points:** each player's best run per battle: cacti cleared (Dino Run), pipes passed (Flappy Bird) or stars caught (Catch Stars). A crash, or losing all 3 lives in Catch Stars, ends a run; players tap **Run again** and only their best counts.
- The two are ranked on **separate leaderboards** (right-hand side).

## How many questions?

| Use | Questions | Game | Time |
|---|---|---|---|
| Quick warm-up | 3 | 30 s | ~2.5 min |
| Standard (default) | 5 | 60 s | ~4 min |
| Full revision game | 8–10 | 60–90 s | ~6–8 min |

## Good to know

- **Three live games:**
  - 🦕 **Dino Run:** tap to jump.
  - 🐦 **Flappy Bird:** slide to steer through pipes.
  - ⭐ **Catch Stars:** slide the basket, catch ⭐ and dodge 💣; 3 lives.

  Flappy Answer (quiz gates) and the English writing games (Connector Catch, Sentence Builder) could be added later. Block Blast and Play Mode don't suit a short shared battle.
- **Cached questions come first.** A match uses the topic's cached, already-reviewed questions (anchor question + question bank, same subject, language and form) before generating anything. Listening questions and long reading passages are skipped because they don't suit a 20-second projector round. Only the shortfall is generated, from the topic's lesson notes (if cached) or the DSKP syllabus extracts.
  - Maths and science questions are tightly on topic.
  - English questions follow the theme but can drift, because the English DSKP is organised around skills rather than topics.
  - Quality is best when Gemini (the primary model) has credit.
- **The projector never shows the answer key before the reveal.** Keys stay on the server.
- **Clean up after events:** `venv/bin/python scripts/purge_quick_join_guests.py --classroom <code> [--yes]` removes guest players.

## Under the hood

| Piece | Where |
|---|---|
| Arena screen | `frontend: src/components/teacher/LiveQuizPanel.tsx` (`MatchSetup`, `MatchProgress`, match runner) |
| Student round view | `src/components/LiveQuizView.tsx` |
| Prepare the questions | `POST /classroom_live/prepare_match` (teacher login, class host only): cached `topic_anchors` MCQs first (`_cached_match_questions`), then generation; language forced by `_effective_language`; stored as a `quizzes` row with `difficulty_level='live_match'` |
| Broadcast a question | `POST /classroom_live/start` with `quiz_id` + `question_index`; the answer key goes to `classroom_live_keys` (service role only) |
| Game round | `POST /classroom_live/start_game`; games listed in `LIVE_GAMES` (`app/main.py`) and `src/lib/liveGames.ts` (keep in sync). Each game takes `goal={Infinity}` + `onScoreUpdate` for endless live runs |
| Round end / reveal / scores | `/classroom_live/end/{id}`, `/reveal/{id}`, `/arena/{id}/scoreboard`; rounds also self-close (sweeper + `/expire`) |
| Join | `/join` page, game PIN (`/classroom_live/pin`, `arena_pins`), Quick Join guests |
