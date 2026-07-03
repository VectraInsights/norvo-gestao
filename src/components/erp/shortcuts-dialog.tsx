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
        <Button variant="ghost" size="sm" title="Atalhos do teclado" aria-label="Atalhos do teclado">
          <Keyboard className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Atalhos</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atalhos do teclado</DialogTitle>
          <DialogDescription>
            Combinações rápidas para navegar pelo sistema. Não funcionam enquanto você digita em um campo.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border/60 text-sm">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between py-2">
              <span>{s.label}</span>
              <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
