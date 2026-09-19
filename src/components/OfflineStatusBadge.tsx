// OfflineStatusBadge — offline indicator, pending sync count, model download
// Renders nothing when online, queue empty, and model already cached.

import { useState, useEffect } from "react";
import { useOnlineSync } from "@/hooks/useOnlineSync";
import { isModelCached, loadOfflineModel } from "@/lib/offlineLlm";

export function OfflineStatusBadge() {
  const { isOnline, pendingCount, syncing, manualSync } = useOnlineSync();
  const [modelCached, setModelCached] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const [dlStatus, setDlStatus] = useState("");

  useEffect(() => {
    void isModelCached().then(setModelCached);
  }, []);

  // null = SSR / not yet hydrated — render nothing to avoid flash
  if (isOnline === null || modelCached === null) return null;
  if (isOnline && pendingCount === 0 && modelCached) return null;

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDlStatus("Memuat turun model…");
    try {
      await loadOfflineModel((status, progress, loaded, total) => {
        setDlStatus(status === "ready" ? "Sedia!" : `${status}…`);
        setDlProgress(Math.round(progress));
        if (loaded && total) {
          const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
          setDlStatus(`Memuat turun… ${mb(loaded)}/${mb(total)} MB`);
        }
      });
      setModelCached(true);
    } catch (e) {
      setDlStatus("Gagal — cuba lagi");
      console.error("[OfflineBadge] model download failed:", e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 w-full flex flex-col gap-0">

      {/* Offline / sync status bar */}
      {(!isOnline || pendingCount > 0) && (
        <button
          onClick={() => { if (isOnline && pendingCount > 0) void manualSync(); }}
          className={[
            "w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium transition-all",
            isOnline
              ? "bg-amber-500 text-amber-950 cursor-pointer"
              : "bg-slate-800 text-slate-300 cursor-default",
          ].join(" ")}
        >
          {isOnline ? (
            syncing
              ? <><span className="animate-spin inline-block">↻</span> Menyegerakkan…</>
              : <><span>↑</span> {pendingCount} jawapan belum dihantar — ketik untuk hantar</>
          ) : (
            <><span>✕</span> Tiada internet{pendingCount > 0 ? ` · ${pendingCount} disimpan` : ""}</>
          )}
        </button>
      )}

      {/* Model download bar — shown when online but model not yet cached */}
      {isOnline && !modelCached && (
        <div className="w-full bg-violet-600 text-white">
          <button
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium cursor-pointer disabled:opacity-70"
          >
            {downloading ? (
              <>
                <span className="animate-spin inline-block">↻</span>
                {dlStatus} {dlProgress > 0 ? `${dlProgress}%` : ""}
              </>
            ) : (
              <><span>⬇</span> Muat turun pek luar talian (~300 MB)</>
            )}
          </button>
          {/* Progress bar while downloading */}
          {downloading && dlProgress > 0 && (
            <div className="w-full h-1 bg-violet-800">
              <div
                className="h-full bg-violet-300 transition-all"
                style={{ width: `${dlProgress}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
