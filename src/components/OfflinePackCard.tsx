import { useState, useEffect } from "react";
import { Download, CheckCircle2, WifiOff } from "lucide-react";
import { isModelCached, loadOfflineModel } from "@/lib/offlineLlm";

interface Props {
  lang?: string;
  /** "dark" for the student dark dashboard; "light" for the teacher card theme */
  variant?: "dark" | "light";
}

export function OfflinePackCard({ lang = "ms", variant = "dark" }: Props) {
  const isBM = lang === "ms";
  const [cached, setCached] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    void isModelCached().then(setCached);
  }, []);

  const handleDownload = async () => {
    if (downloading || cached) return;
    setDownloading(true);
    setStatusMsg(isBM ? "Memulakan muat turun…" : "Starting download…");
    try {
      await loadOfflineModel((st, prog, loaded, total) => {
        // Only the overall total moves the bar; per-file initiate/download/done events carry no %.
        if (st !== "progress_total") {
          if (st === "ready") setStatusMsg(isBM ? "Sedia!" : "Ready!");
          return;
        }
        setProgress(Math.round(prog));
        if (loaded && total) {
          const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
          setStatusMsg(`${mb(loaded)} / ${mb(total)} MB`);
        }
      });
      setCached(true);
      setStatusMsg("");
    } catch (err) {
      // Show the real reason (storage quota, blocked worker, network) instead of a bare "failed".
      const why = err instanceof Error ? err.message : String(err);
      setStatusMsg(`${isBM ? "Gagal" : "Failed"}: ${why.slice(0, 200)}`);
    } finally {
      setDownloading(false);
    }
  };

  // Don't flash before hydration completes
  if (cached === null) return null;

  const isDark = variant === "dark";

  return (
    <section className={
      isDark
        ? "rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 backdrop-blur-xl"
        : "rounded-2xl border border-border bg-card p-5 shadow-card"
    }>
      <div className="flex items-start gap-4">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          cached
            ? isDark ? "bg-emerald-500/20" : "bg-emerald-500/15"
            : isDark ? "bg-violet-500/20" : "bg-violet-500/15"
        }`}>
          {cached ? (
            <CheckCircle2 className={`h-5 w-5 ${isDark ? "text-emerald-300" : "text-emerald-600"}`} />
          ) : (
            <WifiOff className={`h-5 w-5 ${isDark ? "text-violet-300" : "text-violet-600"}`} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={`font-bold ${isDark ? "text-white" : "text-foreground"}`}>
              {isBM ? "Pembantu AI Luar Talian (pilihan)" : "Offline AI helper (optional)"}
            </h3>
            {cached && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-500/15 text-emerald-700"
              }`}>
                {isBM ? "Sedia" : "Ready"}
              </span>
            )}
          </div>
          <p className={`mt-0.5 text-sm ${isDark ? "text-white/60" : "text-muted-foreground"}`}>
            {cached
              ? (isBM
                  ? "Model AI sedia. Tutor memberi petunjuk tanpa internet."
                  : "AI model ready. The tutor gives hints without internet.")
              : (isBM
                  ? "Model AI kecil (~800 MB, sekali sahaja, guna Wi-Fi) untuk petunjuk tutor tanpa internet. Latihan dan penandaan berfungsi tanpanya. Mungkin tidak berjalan pada iPhone lama."
                  : "A small AI model (~800 MB, one time, use Wi-Fi) for tutor hints without internet. Practice and marking work without it. May not run on older iPhones.")}
          </p>

          {/* Progress bar while downloading */}
          {downloading && (
            <div className="mt-3 space-y-1">
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${isDark ? "bg-white/10" : "bg-muted"}`}>
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className={`text-xs ${isDark ? "text-white/50" : "text-muted-foreground"}`}>
                {statusMsg} {progress > 0 ? `${progress}%` : ""}
              </p>
            </div>
          )}

          {!cached && !downloading && (
            <button
              type="button"
              onClick={() => void handleDownload()}
              className={`mt-3 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                isDark
                  ? "bg-violet-500/25 text-violet-200 hover:bg-violet-500/40"
                  : "bg-violet-500/15 text-violet-700 hover:bg-violet-500/25"
              }`}
            >
              <Download className="h-4 w-4" />
              {statusMsg ? (isBM ? "Cuba Lagi" : "Try Again") : (isBM ? "Muat Turun Sekarang" : "Download Now")}
            </button>
          )}

          {!downloading && statusMsg && (
            <p className={`mt-2 text-xs ${isDark ? "text-rose-300" : "text-destructive"}`}>{statusMsg}</p>
          )}
        </div>
      </div>
    </section>
  );
}
