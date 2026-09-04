interface Props {
  /** true for the flappy "steer the bird" games; false for catch/dino. */
  steerGame: boolean;
  onStart: () => void;
}

/**
 * A gentle, one-tap onboarding shown before a penalty mini-game so students
 * understand the drag-to-steer control before anything moves.
 */
export function GameTutorial({ steerGame, onStart }: Props) {
  return (
    <div className="flex w-full max-w-[360px] flex-col gap-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/15">
      <style>{`
        @keyframes kp-bird-steer { 0%,100% { top: 12% } 50% { top: 66% } }
        @keyframes kp-thumb-steer { 0%,100% { top: 14% } 50% { top: 68% } }
      `}</style>
      <h3 className="text-center text-lg font-extrabold text-white">How to play</h3>

      {steerGame ? (
        <>
          <div className="relative mx-auto h-44 w-full max-w-[280px] overflow-hidden rounded-xl bg-gradient-to-b from-sky-400/30 to-indigo-900/50 ring-1 ring-white/10">
            {/* animated bird follows an animated thumb */}
            <div
              className="absolute left-7 h-7 w-7 rounded-full bg-yellow-400 shadow-lg ring-2 ring-amber-800"
              style={{ animation: "kp-bird-steer 2.4s ease-in-out infinite" }}
            />
            <div
              className="absolute right-6 text-3xl drop-shadow"
              style={{ animation: "kp-thumb-steer 2.4s ease-in-out infinite" }}
            >
              👆
            </div>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
              the bird follows your thumb
            </span>
          </div>
          <ol className="flex flex-col gap-2 text-sm text-white/90">
            <li>
              <b>1.</b> Rest your thumb (or mouse) on the game.
            </li>
            <li>
              <b>2.</b> Slide it <b>up and down</b> — the bird glides to follow it. No tapping.
            </li>
            <li>
              <b>3.</b> Steer through the <b>correct answer</b> and avoid the walls.
            </li>
          </ol>
          <p className="text-center text-xs text-white/60">
            You'll get a short warm-up with no obstacles first — take your time. ✨
          </p>
        </>
      ) : (
        <p className="text-center text-sm text-white/90">
          Move to catch the correct answers and dodge the wrong ones. You'll get a short
          warm-up first — ready?
        </p>
      )}

      <button
        onClick={onStart}
        className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-4 py-3 text-base font-bold text-white shadow-xl transition hover:opacity-90 active:scale-95"
      >
        I'm ready — let's go →
      </button>
    </div>
  );
}
