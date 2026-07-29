import { useCallback, useEffect, useMemo, useState } from "react";
import { NAV, type NavGroup } from "@/components/erp/nav-config";

export type MenuPrefs = {
  /** ordem dos labels dos grupos */
  order: string[];
  /** labels ocultos */
  hidden: string[];
};

const EVENT = "norvo:menu-prefs-changed";

const defaultPrefs = (): MenuPrefs => ({ order: NAV.map((g) => g.label), hidden: [] });

function keyFor(userId?: string | null) {
  return `norvo:menu-prefs:${userId ?? "anon"}`;
}

export function getMenuPrefs(userId?: string | null): MenuPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<MenuPrefs>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order : defaultPrefs().order,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return defaultPrefs();
  }
}

export function setMenuPrefs(userId: string | null | undefined, prefs: MenuPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Aplica ordem + visibilidade salvas sobre o NAV padrão. */
export function applyPrefs(prefs: MenuPrefs): NavGroup[] {
  const known = new Set(NAV.map((g) => g.label));
  const ordered = [
    ...prefs.order.filter((l) => known.has(l)),
    ...NAV.map((g) => g.label).filter((l) => !prefs.order.includes(l)),
  ];
  return ordered
    .filter((l) => !prefs.hidden.includes(l))
    .map((l) => NAV.find((g) => g.label === l)!)
    .filter(Boolean);
}

export function useMenuPrefs(userId?: string | null) {
  const [prefs, setPrefsState] = useState<MenuPrefs>(() => defaultPrefs());

  useEffect(() => {
    const read = () => setPrefsState(getMenuPrefs(userId));
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [userId]);

  const save = useCallback((next: MenuPrefs) => setMenuPrefs(userId, next), [userId]);
  const groups = useMemo(() => applyPrefs(prefs), [prefs]);

  return { prefs, groups, save, reset: () => save(defaultPrefs()) };
}
