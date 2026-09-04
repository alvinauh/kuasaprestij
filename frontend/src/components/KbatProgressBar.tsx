import { useState } from "react";

const LEVELS = [
  {
    key: "Memahami",
    code: "C2",
    en: "Explain the concept",
    bm: "Terangkan konsep",
    color: "bg-green-500",
    light: "bg-green-100 text-green-700",
    border: "border-green-500",
  },
  {
    key: "Mengaplikasi",
    code: "C3",
    en: "Apply in a new situation",
    bm: "Guna dalam situasi baru",
    color: "bg-blue-500",
    light: "bg-blue-100 text-blue-700",
    border: "border-blue-500",
  },
  {
    key: "Menganalisis",
    code: "C4",
    en: "Examine causes and effects",
    bm: "Kaji sebab dan akibat",
    color: "bg-amber-500",
    light: "bg-amber-100 text-amber-700",
    border: "border-amber-500",
  },
  {
    key: "Menilai",
    code: "C5",
    en: "Evaluate and justify",
    bm: "Nilai dan justifikasikan",
    color: "bg-red-500",
    light: "bg-red-100 text-red-700",
    border: "border-red-500",
  },
];

interface Props {
  kbatLevel?: string;
  language?: string;
}

export function KbatProgressBar({ kbatLevel = "Memahami", language = "English" }: Props) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const isBm = language.toLowerCase().includes("melayu") || language.toLowerCase() === "bm";
  const currentIdx = LEVELS.findIndex((l) => l.key === kbatLevel);
  const activeIdx = currentIdx >= 0 ? currentIdx : 0;

  return (
    <div className="w-full mb-3">
      {/* Mobile: single pill */}
      <div className="sm:hidden flex justify-center">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white ${LEVELS[activeIdx].color}`}
        >
          {LEVELS[activeIdx].code} · {LEVELS[activeIdx].key}
        </span>
      </div>

      {/* Desktop: stepped progress bar */}
      <div className="hidden sm:flex items-center gap-1 w-full">
        {LEVELS.map((level, idx) => {
          const isPast = idx < activeIdx;
          const isCurrent = idx === activeIdx;
          const isFuture = idx > activeIdx;

          return (
            <div key={level.key} className="flex items-center flex-1 min-w-0">
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 rounded-lg px-2 py-1.5 transition-all
                  focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current"
                style={{ cursor: "default" }}
                onMouseEnter={() => setTooltip(level.key)}
                onMouseLeave={() => setTooltip(null)}
                onFocus={() => setTooltip(level.key)}
                onBlur={() => setTooltip(null)}
                aria-label={`${level.code} ${level.key}`}
              >
                {/* Circle indicator */}
                <span
                  className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${isCurrent ? `${level.color} text-white shadow-sm` : ""}
                    ${isPast ? `${level.color} text-white opacity-60` : ""}
                    ${isFuture ? "bg-gray-200 text-gray-400 border-2 border-gray-300" : ""}
                  `}
                >
                  {isPast ? "✓" : level.code.replace("C", "")}
                </span>

                {/* Label */}
                <span
                  className={`truncate text-xs font-medium leading-tight
                    ${isCurrent ? "text-gray-900 font-semibold" : ""}
                    ${isPast ? "text-gray-400" : ""}
                    ${isFuture ? "text-gray-300" : ""}
                  `}
                >
                  {level.key}
                </span>
              </button>

              {/* Connector arrow */}
              {idx < LEVELS.length - 1 && (
                <span className="text-gray-300 text-xs mx-0.5 shrink-0">›</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip && (() => {
        const lvl = LEVELS.find((l) => l.key === tooltip);
        if (!lvl) return null;
        return (
          <div
            className={`mt-1.5 mx-auto w-fit rounded-md px-3 py-1.5 text-xs font-medium shadow-sm
              ${lvl.light} border ${lvl.border}`}
          >
            <span className="font-semibold">{isBm ? "Aras KBAT" : "Thinking Level"}:</span>{" "}
            {lvl.code} {lvl.key} — {isBm ? lvl.bm : lvl.en}
          </div>
        );
      })()}
    </div>
  );
}
