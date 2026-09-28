import { useEffect, useState } from "react";

export function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      setVisible(true);
      if (nextOnline) window.setTimeout(() => setVisible(false), 3_000);
    };

    setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 rounded-lg border bg-background px-4 py-3 text-center text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:w-auto"
    >
      {online ? "Conexão restabelecida." : "Você está sem conexão. As alterações serão retomadas quando a rede voltar."}
    </div>
  );
}
