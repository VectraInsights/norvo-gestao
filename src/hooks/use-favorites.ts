import { useCallback, useEffect, useState } from "react";

const EVENT = "norvo:favorites-changed";

function keyFor(userId?: string | null) {
  return `norvo:menu-favorites:${userId ?? "anon"}`;
}

export function getFavorites(userId?: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function setFavorites(userId: string | null | undefined, favs: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(favs));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Favoritos do menu (rotas `to` das subcategorias), por usuário. */
export function useFavorites(userId?: string | null) {
  const [favorites, setFavoritesState] = useState<string[]>([]);

  useEffect(() => {
    const read = () => setFavoritesState(getFavorites(userId));
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [userId]);

  const toggle = useCallback(
    (to: string) => {
      const current = getFavorites(userId);
      const next = current.includes(to) ? current.filter((t) => t !== to) : [...current, to];
      setFavorites(userId, next);
    },
    [userId],
  );

  const isFavorite = useCallback((to: string) => favorites.includes(to), [favorites]);

  return { favorites, toggle, isFavorite };
}
