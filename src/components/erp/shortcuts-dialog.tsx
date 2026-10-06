import { useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Alt + H", label: "Dashboard" },
  { keys: "Alt + R", label: "Contas a receber" },
  { keys: "Alt + D", label: "Contas a pagar" },
  { keys: "Alt + C", label: "Clientes" },
  { keys: "Alt + F", label: "Fornecedores" },
  { keys: "Alt + P", label: "Pedidos e propostas" },
  { keys: "Alt + E", label: "Estoque de produtos" },
];

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 rounded-xl px-3 transition-all hover:-translate-y-px" title="Atalhos do teclado" aria-label="Atalhos do teclado">
          <Keyboard className="h-4 w-4" />
          <span className="hidden sm:inline">Atalhos</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader className="gap-1.5 pb-2">
          <DialogTitle className="tracking-tight">Atalhos do teclado</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Combinações rápidas para navegar pelo sistema. Não funcionam enquanto você digita em um campo.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border/60 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
              <span className="font-medium">{s.label}</span>
              <kbd className="shrink-0 rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-xs font-medium shadow-sm">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
