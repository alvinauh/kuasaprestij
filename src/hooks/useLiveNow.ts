import { useEffect, useState } from "react";
import { getLiveNow, type LiveNow } from "@/services/api";

/**
 * Polls the student's "Live now" feed (rounds running in their classes) every 5 s
 * while the tab is visible. `refreshKey` forces an immediate reload, e.g. when a
 * round starts or ends over Realtime. `fetchedAt` lets callers count seconds down
 * from the server's `seconds_left` without trusting the device clock.
 */
export function useLiveNow(enabled: boolean, refreshKey: unknown) {
  const [data, setData] = useState<{ now: LiveNow; fetchedAt: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void getLiveNow()
        .then((now) => { if (!stop) setData({ now, fetchedAt: Date.now() }); })
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 5000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled, refreshKey]);

  return data;
}
