import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 flex max-w-md items-center gap-2.5 rounded-2xl border px-5 py-3.5 text-sm font-medium shadow-xl backdrop-blur transition-all sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-auto",
        online
          ? "border-success/40 bg-success/10 text-success-foreground"
          : "border-warning/50 bg-warning/15 text-warning-foreground",
      )}
    >
      {online ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
      <span className="leading-relaxed">
        {online ? "Conexão restabelecida." : "Você está sem conexão. As alterações serão retomadas quando a rede voltar."}
      </span>
    </div>
  );
}
