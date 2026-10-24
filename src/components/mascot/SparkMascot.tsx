import { motion, useReducedMotion, type Transition } from "motion/react";
import { useId } from "react";

/**
 * "Percik" — the KuasaPrestij idea-spark mascot.
 *
 * Hand-built layered SVG in the flat Duolingo style: chunky rounded shapes,
 * no outlines, one shade tone + one highlight per surface. Every moving part
 * (flame tip, eyes, brows, arms) is its own group so `motion` can animate it
 * independently — squash-and-stretch on landing, idle bob, blinking, a
 * thumbs-up wiggle, and a two-arm cheer for streaks.
 */
export type SparkPose = "thumbsUp" | "cheer";

const C = {
  body: "#FFC93C",
  bodyShade: "#FFA62B",
  bodyDeep: "#F48C06",
  tipHot: "#FF7A1A",
  tipCore: "#FFE58A",
  highlight: "#FFF6D6",
  eyeWhite: "#FFFFFF",
  pupil: "#2B2118",
  brow: "#7A3E0A",
  mouth: "#7A1F12",
  tongue: "#FF6B81",
  cheek: "#FF8A80",
  foot: "#F48C06",
};

const spring = (stiffness = 520, damping = 16, delay = 0): Transition => ({
  type: "spring",
  stiffness,
  damping,
  delay,
});

/** 4-point twinkle star. */
function Twinkle({
  x,
  y,
  size,
  color,
  delay,
  still,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  still: boolean;
}) {
  const s = size;
  const d = `M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`;
  return (
    <motion.path
      d={d}
      fill={color}
      initial={{ scale: 0, rotate: -45, opacity: 0 }}
      animate={
        still
          ? { scale: 1, rotate: 0, opacity: 1 }
          : { scale: [0, 1.25, 0.85, 1.1, 0], rotate: [-45, 0, 20, 45, 90], opacity: [0, 1, 1, 1, 0] }
      }
      transition={
        still
          ? { duration: 0.2 }
          : { duration: 1.6, delay, repeat: Infinity, repeatDelay: 0.4, ease: "easeInOut" }
      }
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    />
  );
}

export function SparkMascot({
  pose = "thumbsUp",
  size = 140,
  className,
}: {
  pose?: SparkPose;
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const still = !!useReducedMotion();
  const cheer = pose === "cheer";

  const bodyPath =
    "M100 34 C 120 62, 162 86, 162 132 C 162 170, 134 194, 100 194 C 66 194, 38 170, 38 132 C 38 86, 80 62, 100 34 Z";

  const loop = <T extends object>(anim: T, t: Transition): { animate: T; transition: Transition } | object =>
    still ? {} : { animate: anim, transition: t };

  return (
    <svg
      viewBox="0 0 200 230"
      width={size}
      height={(size * 230) / 200}
      className={className}
      role="img"
      aria-label="Percik the idea spark"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#FFE27A" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#FFC93C" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#FFC93C" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`body-${uid}`}>
          <path d={bodyPath} />
        </clipPath>
        <clipPath id={`mouth-${uid}`}>
          <path d="M84 150 Q100 152 116 150 Q114 172 100 173 Q86 172 84 150 Z" />
        </clipPath>
      </defs>

      {/* Halo glow pulses behind the character */}
      <motion.ellipse
        cx="100"
        cy="128"
        rx="100"
        ry="100"
        fill={`url(#glow-${uid})`}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        {...loop({ scale: [0.92, 1.06, 0.92], opacity: [0.8, 1, 0.8] }, {
          duration: 1.8,
          repeat: Infinity,
          ease: "easeInOut",
        })}
      />

      {/* Ground shadow — shrinks as the body bobs up */}
      <motion.ellipse
        cx="100"
        cy="214"
        rx="44"
        ry="7"
        fill="#000"
        opacity={0.14}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        {...loop({ scaleX: [1, 0.82, 1] }, { duration: 1.1, repeat: Infinity, ease: "easeInOut" })}
      />

      {/* Whole character: idle bob */}
      <motion.g {...loop({ y: [0, -7, 0] }, { duration: 1.1, repeat: Infinity, ease: "easeInOut" })}>
        {/* Landing squash & stretch, anchored at the feet */}
        <motion.g
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
          initial={still ? false : { scaleX: 0.8, scaleY: 1.2 }}
          animate={{ scaleX: 1, scaleY: 1 }}
          transition={spring(600, 9, 0.12)}
        >
          {/* Feet */}
          <ellipse cx="80" cy="198" rx="15" ry="9" fill={C.foot} />
          <ellipse cx="120" cy="198" rx="15" ry="9" fill={C.foot} />

          {/* Back arm (viewer's left) */}
          <motion.g
            style={{ transformBox: "fill-box", transformOrigin: "100% 50%" }}
            initial={still ? false : { rotate: 30 }}
            animate={cheer ? { rotate: still ? 0 : [0, -14, 0] } : { rotate: 0 }}
            transition={
              cheer && !still
                ? { duration: 0.5, repeat: Infinity, ease: "easeInOut", delay: 0.35 }
                : spring(400, 14, 0.2)
            }
          >
            {cheer ? (
              <>
                <path d="M46 132 Q30 108 22 82" stroke={C.bodyShade} strokeWidth="15" strokeLinecap="round" fill="none" />
                <circle cx="21" cy="78" r="11" fill={C.body} />
                <circle cx="17" cy="74" r="3.5" fill={C.highlight} opacity="0.8" />
              </>
            ) : (
              <>
                <path d="M44 140 Q26 150 24 166" stroke={C.bodyShade} strokeWidth="15" strokeLinecap="round" fill="none" />
                <circle cx="24" cy="168" r="10" fill={C.body} />
              </>
            )}
          </motion.g>

          {/* Body */}
          <g clipPath={`url(#body-${uid})`}>
            <path d={bodyPath} fill={C.body} />
            {/* Shade crescent, lower-right */}
            <circle cx="138" cy="168" r="70" fill={C.bodyShade} />
            <circle cx="122" cy="148" r="70" fill={C.body} />
            {/* Belly glow */}
            <ellipse cx="100" cy="184" rx="30" ry="14" fill={C.tipCore} opacity="0.5" />
            {/* Top-left highlight */}
            <ellipse cx="66" cy="104" rx="10" ry="20" fill={C.highlight} opacity="0.9" transform="rotate(28 66 104)" />
            <circle cx="62" cy="130" r="4.5" fill={C.highlight} opacity="0.9" />
          </g>

          {/* Flame tip — flickers like a live spark */}
          <motion.g
            style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
            {...loop(
              { rotate: [-7, 6, -4, 7, -7], scaleY: [1, 1.12, 0.94, 1.08, 1] },
              { duration: 0.9, repeat: Infinity, ease: "easeInOut" },
            )}
          >
            <path d="M100 6 C 108 22, 122 34, 118 50 C 115 62, 85 62, 82 50 C 79 38, 96 28, 100 6 Z" fill={C.tipHot} />
            <path d="M100 22 C 105 32, 112 40, 109 50 C 107 57, 93 57, 91 50 C 89 42, 98 36, 100 22 Z" fill={C.tipCore} />
          </motion.g>
          {/* Embers drifting off the flame */}
          {!still &&
            [
              { cx: 76, cy: 58, r: 4, d: 0 },
              { cx: 126, cy: 52, r: 3, d: 0.6 },
              { cx: 112, cy: 30, r: 2.5, d: 1.1 },
            ].map((e, i) => (
              <motion.circle
                key={i}
                cx={e.cx}
                cy={e.cy}
                r={e.r}
                fill={i === 1 ? C.tipHot : C.body}
                animate={{ y: [0, -26], x: [0, i === 0 ? -8 : 8], opacity: [0, 1, 0], scale: [0.6, 1, 0.4] }}
                transition={{ duration: 1.4, delay: e.d, repeat: Infinity, ease: "easeOut" }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            ))}

          {/* Face */}
          <g>
            {/* Brows pop up with excitement */}
            <motion.g
              initial={still ? false : { y: 6 }}
              animate={{ y: cheer ? -4 : -1 }}
              transition={spring(500, 12, 0.25)}
            >
              <path d="M70 100 Q80 93 90 99" stroke={C.brow} strokeWidth="4.5" strokeLinecap="round" fill="none" />
              <path d="M110 99 Q120 93 130 100" stroke={C.brow} strokeWidth="4.5" strokeLinecap="round" fill="none" />
            </motion.g>

            {/* Eyes — blink on a loop */}
            <motion.g
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              {...loop(
                { scaleY: [1, 1, 0.08, 1, 1] },
                { duration: 3.2, times: [0, 0.9, 0.94, 0.98, 1], repeat: Infinity, delay: 0.8 },
              )}
            >
              <ellipse cx="81" cy="124" rx="13" ry="16" fill={C.eyeWhite} />
              <ellipse cx="119" cy="124" rx="13" ry="16" fill={C.eyeWhite} />
              <motion.g
                initial={still ? false : { x: 0, y: 0 }}
                animate={{ x: cheer ? 0 : 2.5, y: cheer ? -2 : 1 }}
                transition={spring(300, 18, 0.3)}
              >
                <circle cx="83" cy="127" r="8.5" fill={C.pupil} />
                <circle cx="121" cy="127" r="8.5" fill={C.pupil} />
                <circle cx="86" cy="123" r="3.2" fill="#fff" />
                <circle cx="124" cy="123" r="3.2" fill="#fff" />
                <circle cx="80.5" cy="130.5" r="1.4" fill="#fff" opacity="0.8" />
                <circle cx="118.5" cy="130.5" r="1.4" fill="#fff" opacity="0.8" />
              </motion.g>
            </motion.g>

            {/* Cheeks */}
            <ellipse cx="62" cy="148" rx="9" ry="5.5" fill={C.cheek} opacity="0.75" />
            <ellipse cx="138" cy="148" rx="9" ry="5.5" fill={C.cheek} opacity="0.75" />

            {/* Big open grin */}
            <motion.g
              style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
              initial={still ? false : { scaleY: 0.3 }}
              animate={{ scaleY: cheer ? 1.12 : 1 }}
              transition={spring(500, 11, 0.2)}
            >
              <path d="M84 150 Q100 152 116 150 Q114 172 100 173 Q86 172 84 150 Z" fill={C.mouth} />
              <g clipPath={`url(#mouth-${uid})`}>
                <ellipse cx="100" cy="174" rx="12" ry="9" fill={C.tongue} />
                <rect x="88" y="148" width="24" height="5" rx="2.5" fill="#fff" />
              </g>
            </motion.g>
          </g>

          {/* Front arm (viewer's right): thumbs-up or cheer */}
          <motion.g
            style={{ transformBox: "fill-box", transformOrigin: "0% 100%" }}
            initial={still ? false : { rotate: 70, scale: 0.6 }}
            animate={
              still
                ? { rotate: 0, scale: 1 }
                : cheer
                  ? { rotate: [0, 14, 0], scale: 1 }
                  : { rotate: [0, -10, 4, -6, 0], scale: [1, 1.12, 1, 1.06, 1] }
            }
            transition={
              still
                ? { duration: 0 }
                : cheer
                  ? { duration: 0.5, repeat: Infinity, ease: "easeInOut", delay: 0.35 }
                  : { duration: 0.9, delay: 0.3, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }
            }
          >
            {cheer ? (
              <>
                <path d="M154 132 Q170 108 178 82" stroke={C.bodyShade} strokeWidth="15" strokeLinecap="round" fill="none" />
                <circle cx="179" cy="78" r="11" fill={C.body} />
                <circle cx="175" cy="74" r="3.5" fill={C.highlight} opacity="0.8" />
              </>
            ) : (
              <>
                <path d="M156 140 Q172 132 178 116" stroke={C.bodyShade} strokeWidth="15" strokeLinecap="round" fill="none" />
                {/* Fist */}
                <rect x="164" y="98" width="30" height="26" rx="11" fill={C.body} />
                <path d="M168 108 H186 M168 115 H186" stroke={C.bodyShade} strokeWidth="3" strokeLinecap="round" />
                {/* Thumb */}
                <rect x="166" y="72" width="13" height="34" rx="6.5" fill={C.body} />
                <ellipse cx="170" cy="80" rx="2.6" ry="5" fill={C.highlight} opacity="0.9" />
                <rect x="166" y="98" width="13" height="4" rx="2" fill={C.bodyShade} opacity="0.6" />
              </>
            )}
          </motion.g>
        </motion.g>
      </motion.g>

      {/* Twinkles */}
      <Twinkle x={24} y={40} size={10} color="#FFE27A" delay={0.1} still={still} />
      <Twinkle x={182} y={34} size={8} color="#7DD3FC" delay={0.5} still={still} />
      <Twinkle x={190} y={150} size={7} color="#FFE27A" delay={0.9} still={still} />
      <Twinkle x={12} y={130} size={6} color="#F9A8D4" delay={1.2} still={still} />
    </svg>
  );
}
