"use client";
import { useCallback } from "react";

export const THEME_KEY = "nectar-theme";

/** Inline in <head> before paint: applies a stored explicit choice; otherwise tokens.css follows the OS (dark default). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;

export function currentTheme(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function setTheme(t: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* storage blocked: theme still applies for this page */
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const toggle = useCallback(() => setTheme(currentTheme() === "dark" ? "light" : "dark"), []);
  return (
    <button type="button" className={`ghost ${className ?? ""}`} onClick={toggle} aria-label="Toggle light and dark theme" data-testid="theme-toggle">
      <span aria-hidden="true">◐</span> theme
    </button>
  );
}
