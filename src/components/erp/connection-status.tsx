import { useEffect, useState } from "react";

export function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimer: number | undefined;
    const update = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      setVisible(true);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      if (nextOnline) hideTimer = window.setTimeout(() => setVisible(false), 3_000);
    };

    setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 bottom-3 z-50 rounded-lg border px-4 py-3 text-center text-sm shadow-lg sm:inset-x-auto sm:right-4 sm:w-auto ${online ? "border-success/40 bg-success/10 text-success-foreground" : "border-warning/50 bg-warning/15 text-warning-foreground"}`}
    >
      {online ? "Conexão restabelecida." : "Você está sem conexão. As alterações serão retomadas quando a rede voltar."}
    </div>
  );
}
