import { useEffect, useState } from "react";
import { applyTheme, getThemeMode, setThemeMode, type ThemeMode } from "@/lib/theme";

/** Current theme mode + the resolved light/dark; re-applies when the OS theme flips in "auto". */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const sync = () => {
      const m = getThemeMode();
      setMode(m);
      setResolved(document.documentElement.classList.contains("light") ? "light" : "dark");
    };
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onOs = () => {
      if (getThemeMode() === "auto") applyTheme("auto");
      sync();
    };
    mq.addEventListener("change", onOs);
    window.addEventListener("skor-theme", sync);
    return () => {
      mq.removeEventListener("change", onOs);
      window.removeEventListener("skor-theme", sync);
    };
  }, []);

  return { mode, resolved, setMode: setThemeMode };
}
