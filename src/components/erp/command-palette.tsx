import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSelectedEmpresaId } from "@/hooks/use-empresa";

const ROUTES: { label: string; to: string; hint?: string }[] = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Contas a receber", to: "/financeiro/receber" },
  { label: "Contas a pagar", to: "/financeiro/pagar" },
  { label: "Fluxo de caixa", to: "/financeiro/fluxo" },
  { label: "Contas financeiras", to: "/financeiro/contas" },
  { label: "Clientes", to: "/vendas/clientes" },
  { label: "Vendas", to: "/vendas/vendas" },
  { label: "Orçamentos", to: "/vendas/pedidos" },
  { label: "Produtos", to: "/estoque/produtos" },
  { label: "Fornecedores", to: "/estoque/fornecedores" },
  { label: "Movimentações", to: "/estoque/movimentacoes" },
  { label: "Notas fiscais", to: "/fiscal/notas" },
  { label: "Configurações", to: "/configuracoes" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const empresaId = useSelectedEmpresaId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim();
  const enabled = open && !!empresaId && term.length >= 2;

  const { data: contatos } = useQuery({
    queryKey: ["cmd-contatos", empresaId, term],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("contatos").select("id,nome,tipo")
        .eq("empresa_id", empresaId!).ilike("nome", `%${term}%`).limit(6);
      return data ?? [];
    },
  });

  const { data: produtos } = useQuery({
    queryKey: ["cmd-produtos", empresaId, term],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("produtos").select("id,nome,sku")
        .eq("empresa_id", empresaId!).ilike("nome", `%${term}%`).limit(6);
      return data ?? [];
    },
  });

  const { data: lancamentos } = useQuery({
    queryKey: ["cmd-lanc", empresaId, term],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("lancamentos_financeiros").select("id,descricao,tipo,valor")
        .eq("empresa_id", empresaId!).ilike("descricao", `%${term}%`).limit(6);
      return data ?? [];
    },
  });

  const go = (to: string) => { setOpen(false); setQ(""); navigate({ to }); };

  return (
    <>
      <Button
        variant="outline" size="sm"
        className="h-8 gap-2 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="ml-1 hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar páginas, clientes, produtos, lançamentos…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{term.length < 2 ? "Digite ao menos 2 caracteres." : "Nada encontrado."}</CommandEmpty>

          <CommandGroup heading="Páginas">
            {ROUTES.filter((r) => !term || r.label.toLowerCase().includes(term.toLowerCase())).map((r) => (
              <CommandItem key={r.to} value={r.label} onSelect={() => go(r.to)}>{r.label}</CommandItem>
            ))}
          </CommandGroup>

          {contatos && contatos.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Clientes / Fornecedores">
                {contatos.map((c) => (
                  <CommandItem key={c.id} value={`contato-${c.id}-${c.nome}`}
                    onSelect={() => go(c.tipo === "fornecedor" ? "/estoque/fornecedores" : "/vendas/clientes")}>
                    <span className="truncate">{c.nome}</span>
                    <span className="ml-auto text-xs text-muted-foreground capitalize">{c.tipo}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {produtos && produtos.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Produtos">
                {produtos.map((p) => (
                  <CommandItem key={p.id} value={`prod-${p.id}-${p.nome}`} onSelect={() => go("/estoque/produtos")}>
                    <span className="truncate">{p.nome}</span>
                    {p.sku && <span className="ml-auto text-xs text-muted-foreground">{p.sku}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {lancamentos && lancamentos.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Lançamentos">
                {lancamentos.map((l) => (
                  <CommandItem key={l.id} value={`lanc-${l.id}-${l.descricao}`}
                    onSelect={() => go(l.tipo === "pagar" ? "/financeiro/pagar" : "/financeiro/receber")}>
                    <span className="truncate">{l.descricao}</span>
                    <span className="ml-auto text-xs text-muted-foreground text-tabular">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(l.valor))}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
