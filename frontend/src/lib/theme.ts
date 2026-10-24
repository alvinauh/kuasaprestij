// Light / dark / auto theme. The choice lives in localStorage ("skor_theme") and is applied
// as a class on <html> ("light" or "dark"); styles.css keys every token off that class.
// THEME_INIT_SCRIPT runs inline in <head> so the first paint already has the right theme.
export type ThemeMode = "auto" | "light" | "dark";

const KEY = "skor_theme";

export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("${KEY}")||"dark";var l=m==="light"||(m==="auto"&&window.matchMedia("(prefers-color-scheme: light)").matches);var c=document.documentElement.classList;c.remove("dark","light");c.add(l?"light":"dark");var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",l?"#ffffff":"#7c3aed")}catch(e){}})();`;

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "auto" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(mode: ThemeMode): "light" | "dark" {
  const light =
    mode === "light" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);
  const cl = document.documentElement.classList;
  cl.remove("dark", "light");
  cl.add(light ? "light" : "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#ffffff" : "#7c3aed");
  return light ? "light" : "dark";
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: applies for this page view only */
  }
  applyTheme(mode);
  window.dispatchEvent(new Event("skor-theme"));
}
