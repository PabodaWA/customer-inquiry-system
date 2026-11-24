"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

type ThemeToggleProps = { className?: string; onThemeChange?: () => void };

export default function ThemeToggle({ className = "", onThemeChange }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  const isDark = mounted && resolvedTheme === "dark";
  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={() => { setTheme(isDark ? "light" : "dark"); onThemeChange?.(); }}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Change theme"}
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Change theme"}
    >
      {isDark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
    </button>
  );
}
