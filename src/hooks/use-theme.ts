import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "norvo:theme";

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function initial(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const t = initial();
    setTheme(t);
    apply(t);
  }, []);

  const change = (t: Theme) => {
    setTheme(t);
    apply(t);
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, t);
  };

  return { theme, setTheme: change, toggle: () => change(theme === "dark" ? "light" : "dark") };
}
