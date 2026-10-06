import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NAV } from "@/components/erp/nav-config";
import type { MenuPrefs } from "@/hooks/use-menu-prefs";
import { cn } from "@/lib/utils";

type Props = {
  prefs: MenuPrefs;
  onSave: (p: MenuPrefs) => void;
  onReset: () => void;
  collapsed?: boolean;
};

export function MenuSettingsDialog({ prefs, onSave, onReset, collapsed }: Props) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<string[]>(prefs.order);
  const [hidden, setHidden] = useState<string[]>(prefs.hidden);

  useEffect(() => {
    if (open) {
      const known = NAV.map((g) => g.label);
      setOrder([
        ...prefs.order.filter((l) => known.includes(l)),
        ...known.filter((l) => !prefs.order.includes(l)),
      ]);
      setHidden(prefs.hidden);
    }
  }, [open, prefs]);

  const move = (index: number, delta: number) => {
    setOrder((o) => {
      const next = [...o];
      const target = index + delta;
      if (target < 0 || target >= next.length) return o;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggle = (label: string) =>
    setHidden((h) => (h.includes(label) ? h.filter((l) => l !== label) : [...h, label]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center rounded-xl text-sm text-sidebar-foreground/80 transition-all hover:-translate-y-px hover:bg-sidebar-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-2.5",
          )}
          aria-label="Personalizar menu"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Personalizar menu</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader className="gap-1.5 pb-2">
          <DialogTitle className="tracking-tight">Personalizar menu</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Defina a ordem e quais categorias aparecem na barra lateral. A preferência é salva para o seu usuário.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {order.map((label, i) => {
            const group = NAV.find((g) => g.label === label);
            if (!group) return null;
            const Icon = group.icon;
            const isHidden = hidden.includes(label);
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
                  isHidden && "opacity-50",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-sm font-medium">{label}</span>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                  aria-label={`Mover ${label} para cima`} disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                  aria-label={`Mover ${label} para baixo`} disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                  aria-label={isHidden ? `Mostrar ${label}` : `Ocultar ${label}`}
                  onClick={() => toggle(label)}
                >
                  {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button" variant="ghost"
            onClick={() => { onReset(); setOpen(false); }}
          >
            Restaurar padrão
          </Button>
          <Button
            type="button"
            onClick={() => { onSave({ order, hidden }); setOpen(false); }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
