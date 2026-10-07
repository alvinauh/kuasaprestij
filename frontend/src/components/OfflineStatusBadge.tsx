// OfflineStatusBadge — offline indicator and pending sync count.
// Renders nothing when online with an empty queue. The model and question bank
// downloads live on the /offline page (OfflineAppCard links there).

import { useOnlineSync } from "@/hooks/useOnlineSync";
import { useI18n } from "@/lib/i18n";

export function OfflineStatusBadge() {
  const { isOnline, pendingCount, syncing, manualSync } = useOnlineSync();
  const { lang } = useI18n();
  const isBM = lang === "ms";

  // null = SSR / not yet hydrated — render nothing to avoid flash
  if (isOnline === null) return null;
  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="sticky top-0 z-50 w-full">
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
            ? <><span className="animate-spin inline-block">↻</span> {isBM ? "Menyegerakkan…" : "Syncing…"}</>
            : <><span>↑</span> {isBM
                ? `${pendingCount} jawapan belum dihantar — ketik untuk hantar`
                : `${pendingCount} answer${pendingCount === 1 ? "" : "s"} not sent yet — tap to send`}</>
        ) : (
          <><span>✕</span> {isBM ? "Tiada internet" : "No internet"}
            {pendingCount > 0 ? ` · ${pendingCount} ${isBM ? "disimpan" : "saved"}` : ""}</>
        )}
      </button>
    </div>
  );
}
