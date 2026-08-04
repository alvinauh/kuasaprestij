# Lovable Frontend Prompt — Session 14: Gamification + Quizizz-style UI

Redesign the KuasaPrestij quiz experience to match the look and feel of Quizizz / Kahoot / Wayground. Add streaks, scores, praises, and three randomised 2D penalty mini-games that trigger when a student gets 3 wrong answers in a row. Do not change the authentication, teacher dashboard, or subject/topic selector screens.

---

## 1. GLOBAL VISUAL REDESIGN — Quizizz / Kahoot style

Apply these styles to the **quiz screen only** (from the moment the question loads until the topic is marked complete or the student navigates away).

- **Background:** deep indigo/violet gradient, e.g. `from-[#1a0533] to-[#2d0a6e]`, or a Kahoot-style dark purple.
- **Question card:** white, `rounded-2xl`, `shadow-2xl`, `p-6`. Large question text (≥ `text-xl font-bold`).
- **MCQ answer buttons:** four large buttons (full-width, `py-4`, `rounded-xl`, `text-white font-bold text-lg`), one colour each:
  - A → red-500, B → blue-500, C → yellow-500, D → green-500
  - Selected state: add a white ring (`ring-4 ring-white`) and scale up slightly (`scale-105`)
  - Correct flash: pulse green; wrong flash: shake + red.
- **Short answer / Essay:** white textarea on the dark background, submit button in primary indigo.
- **Top bar (always visible during quiz):**
  - Left: flame icon + streak count (e.g. "🔥 3") — hidden when streak = 0
  - Centre: score (e.g. "1 350 pts"), animated +NNN popup on each correct answer
  - Right: question counter (e.g. "Q 4")
- **Responsive:** works on mobile (360 px) and desktop (1280 px). Buttons must be thumb-friendly.

---

## 2. GAMIFICATION STATE — sourced from `/submit_answer` response

The `/submit_answer` response now includes:

```json
{
  "is_correct": true,
  "streak": 3,
  "wrong_count": 1,
  "score": 1350,
  "points_awarded": 130,
  "trigger_penalty_game": false,
  ...existing fields...
}
```

**Track in React state:**
- `streak` — current consecutive correct answers
- `score` — cumulative session score
- `wrongCount` — cumulative wrong answers this session
- `triggerPenaltyGame` — flag from backend; when true, open the penalty game modal

---

## 3. CORRECT ANSWER — praise + animation

When `is_correct === true`:

1. Flash the selected button green.
2. Show a floating `+{points_awarded} pts` text that rises and fades out (CSS keyframe animation).
3. Show a praise message overlay (centred, large font, fades in and out over 1.5 s) chosen **randomly** from:
   - "Awesome! 🌟"
   - "Brilliant! 🔥"
   - "Nailed it! 💥"
   - "Superstar! ⭐"
   - "Keep going! 🚀"
   - "Perfect! 🎯"
4. If `streak >= 3`, add a larger celebration — confetti burst (use `canvas-confetti` npm package or CSS confetti) and the message "🔥 On Fire!".
5. After 1.5 s, automatically proceed to the next question (call the existing "Next" logic).

---

## 4. WRONG ANSWER — penalty feedback

When `is_correct === false`:

1. Flash the selected button red + shake animation.
2. Show feedback text from the response.
3. If `trigger_penalty_game === true`, after 1 s:
   - Open the **PenaltyGameModal** (see Section 5) in full-screen overlay.
   - Do NOT advance to the next question until the modal closes.
4. If `trigger_penalty_game === false`, after 2 s auto-advance to the next question normally.

---

## 5. PENALTY GAME MODAL — three randomised mini-games

Create a `PenaltyGameModal` component. When opened, it randomly picks one of three HTML5 Canvas games (Math.random() < 0.33 → Game A, < 0.66 → Game B, else Game C).

Show a title banner: **"Oops! Time for a mini-challenge before we continue…"**

After the game ends (win or lose), show:
- Win: "Great effort! Back to learning 🎉" — green banner
- Lose: "Nice try! Keep going 💪" — yellow banner

Then after 1.5 s, close the modal and advance to the next question.

---

### GAME A — Catch the Falling Stars

Canvas size: 360 × 480 (or full viewport on mobile). 30-second timer.

**Setup:**
- Background: dark blue gradient.
- A bucket (rectangle, 60 × 20 px, bright yellow) sits at the bottom centre.
- Stars (⭐ emoji or drawn 5-point star, ~24 px) fall from random x positions at the top, at varying speeds (80–180 px/s).

**Controls:**
- Desktop: `mousemove` moves the bucket horizontally.
- Mobile: `touchmove` moves the bucket horizontally.

**Mechanics:**
- New star spawns every 0.8 s.
- If a star's bottom edge overlaps the bucket's top edge and their x positions overlap: catch +1, star disappears.
- If a star exits the bottom: it disappears (no penalty).
- Goal: catch **10 stars** within 30 s → win.
- If timer runs out with < 10 caught → lose.

**HUD:** top bar shows "⭐ {caught}/10" and countdown timer.

---

### GAME B — Dino Runner

Canvas size: 360 × 200. Score counted by obstacles cleared.

**Setup:**
- Ground line at y = 170.
- A simple rectangle "dino" (30 × 40 px, green) at x = 60, standing on the ground.
- Cacti (rectangle, 20 × 40 px, dark green) spawn from the right edge and move left at 200 px/s (speed increases over time).

**Controls:**
- Tap / click / spacebar → dino jumps. One jump allowed at a time (no double-jump).
- Jump arc: upward velocity −400 px/s, gravity +800 px/s².

**Mechanics:**
- Cactus spawns every 1.5–2.5 s (random).
- Collision: if dino's bounding box overlaps cactus → game over (lose).
- Count cacti that leave the left edge → obstacles cleared.
- **Win condition:** clear **5 obstacles** → win.
- **Lose condition:** collision → lose.

**HUD:** "Cleared: {n}/5"

---

### GAME C — Flappy Bird

Canvas size: 360 × 480.

**Setup:**
- Background: sky blue gradient.
- A small bird (circle, 20 px radius, yellow) starts at x = 80, y = 240.
- Pairs of pipes (rectangles, 60 px wide, dark green) approach from the right. Gap between top pipe and bottom pipe: 130 px. Gap y-position is random per pair.

**Controls:**
- Tap / click / spacebar → flap: set bird's vertical velocity to −280 px/s.
- Gravity: +500 px/s².

**Mechanics:**
- Pipe speed: 150 px/s.
- New pipe pair spawns when previous pair reaches x = 180.
- Collision: bird hits a pipe or exits the canvas (top or bottom) → game over (lose).
- Score: increment when bird passes a pipe pair's right edge.
- **Win condition:** pass **3 pipe pairs** → win.
- **Lose condition:** collision or exits canvas.

**HUD:** "Pipes: {n}/3"

---

## 6. IMPLEMENTATION NOTES

- Use a single `useRef` for the Canvas element and `requestAnimationFrame` for the game loop. Cancel the animation frame in the `useEffect` cleanup.
- Each game is a self-contained React component (`CatchStarsGame`, `DinoRunnerGame`, `FlappyBirdGame`) that accepts an `onGameEnd(won: boolean)` callback prop.
- `PenaltyGameModal` imports all three, picks one at mount time using `useRef(Math.floor(Math.random() * 3))` (useRef so it doesn't re-randomise on re-renders).
- Install `canvas-confetti` for the correct-answer celebration: `npm install canvas-confetti @types/canvas-confetti`.
- The top-bar score counter (`score` state) should update with a smooth CSS number roll or a simple `+NNN` pop animation using a `key`-prop trick to restart the animation.
- Do not break the existing `InteractiveVideoPlayer`, `question_type` branching, or tutor chat.

---

## 7. SUMMARY OF NEW COMPONENTS

| Component | Purpose |
|---|---|
| `GameTopBar` | Score + streak + question counter |
| `PraiseOverlay` | Random praise message + optional confetti on streak ≥ 3 |
| `PenaltyGameModal` | Fullscreen overlay, picks random game |
| `CatchStarsGame` | Mini-game A |
| `DinoRunnerGame` | Mini-game B |
| `FlappyBirdGame` | Mini-game C |

Wire these into the existing quiz answer-submission flow. All other screens remain unchanged.
