// OfflineAppCard — dashboard entry point to the installable offline app.
// On the main site it opens the offline app (its own Cloud Run origin, so it can
// precache a production build); inside the offline app it goes to /offline.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Smartphone, ArrowRight, CheckCircle2 } from "lucide-react";
import { IS_OFFLINE_APP, OFFLINE_APP_URL, getPackInfo, type PackInfo } from "@/lib/offlinePacks";

interface Props {
  lang?: string;
  /** "dark" for the student dashboard; "light" for the teacher card theme */
  variant?: "dark" | "light";
}

export function OfflineAppCard({ lang = "ms", variant = "dark" }: Props) {
  const isBM = lang === "ms";
  const isDark = variant === "dark";
  const [pack, setPack] = useState<PackInfo | null>(null);

  useEffect(() => {
    if (IS_OFFLINE_APP) void getPackInfo().then(setPack);
  }, []);

  const ready = IS_OFFLINE_APP && !!pack;
  const label = IS_OFFLINE_APP
    ? (isBM ? "Urus aplikasi luar talian" : "Manage offline app")
    : (isBM ? "Dapatkan aplikasi luar talian" : "Get the offline app");
  const buttonClass = `mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
    isDark
      ? "bg-violet-500/25 text-violet-200 hover:bg-violet-500/40"
      : "bg-violet-500/15 text-violet-700 hover:bg-violet-500/25"
  }`;

  return (
    <section className={
      isDark
        ? "rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 backdrop-blur-xl"
        : "rounded-2xl border border-border bg-card p-5 shadow-card"
    }>
      <div className="flex items-start gap-4">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          ready
            ? isDark ? "bg-emerald-500/20" : "bg-emerald-500/15"
            : isDark ? "bg-violet-500/20" : "bg-violet-500/15"
        }`}>
          {ready
            ? <CheckCircle2 className={`h-5 w-5 ${isDark ? "text-emerald-300" : "text-emerald-600"}`} />
            : <Smartphone className={`h-5 w-5 ${isDark ? "text-violet-300" : "text-violet-600"}`} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`font-bold ${isDark ? "text-white" : "text-foreground"}`}>
            {isBM ? "Aplikasi Luar Talian" : "Offline app"}
          </h3>
          <p className={`mt-0.5 text-sm ${isDark ? "text-white/60" : "text-muted-foreground"}`}>
            {ready
              ? (isBM
                  ? `${pack!.questions} soalan sedia untuk latihan tanpa internet.`
                  : `${pack!.questions} questions ready to practise without internet.`)
              : (isBM
                  ? "Pasang Skor pada telefon, tablet atau komputer dan berlatih tanpa internet. Jawapan diselaraskan bila anda dalam talian semula."
                  : "Install Skor on your phone, tablet or computer and practise without internet. Answers sync when you're back online.")}
          </p>
          {IS_OFFLINE_APP ? (
            <Link to="/offline" className={buttonClass}>
              {label} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <a href={`${OFFLINE_APP_URL}/offline`} target="_blank" rel="noopener" className={buttonClass}>
              {label} <ArrowRight className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
