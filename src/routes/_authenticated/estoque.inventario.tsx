import { MoneyInput } from "@/components/erp/money-input";
import { Combobox } from "@/components/erp/combobox";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList, ClipboardCheck, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque/inventario")({
  component: Inventario,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center shadow-sm animate-in fade-in zoom-in duration-300 sm:p-10"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10">
        <Search className="h-6 w-6 text-destructive" />
      </div>
      <p className="mt-4 text-base font-semibold tracking-tight text-foreground">
        Não foi possível carregar o inventário
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Erro desconhecido"}
      </p>
    </div>
  ),
});

type ProdInv = {
  id: string;
  nome: string;
  unidade: string | null;
  estoque_atual: number | null;
  preco_custo: number | null;
};

function Inventario() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [somenteDiverg, setSomenteDiverg] = useState(false);
  const [depositoId, setDepositoId] = useState<string>("");

  const { data: produtos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["produtos-inventario", empresa?.id],
    queryFn: async ({ signal }) => {
      // Busca em páginas: sem range, o Supabase corta em 1000 (sem aviso)
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("produtos")
          .select("id,nome,unidade,estoque_atual,preco_custo")
          .eq("empresa_id", empresa!.id)
          .eq("ativo", true)
          .order("nome")
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as ProdInv[];
    },
  });

  const { data: depositos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["depositos-inventario", empresa?.id],
    queryFn: async ({ signal }) => {
      // Busca em páginas: sem range, o Supabase corta em 1000 (sem aviso)
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("depositos")
          .select("id,nome")
          .eq("empresa_id", empresa!.id)
          .eq("ativo", true)
          .order("nome")
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as { id: string; nome: string }[];
    },
  });

  const parseNum = (v: string | undefined): number | null => {
    if (v === undefined || v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const divergencias = useMemo(() => {
    if (!produtos) return [];
    return produtos
      .map((p) => ({ prod: p, contado: parseNum(counts[p.id]) }))
      .filter(
        (r): r is { prod: ProdInv; contado: number } =>
          r.contado !== null && r.contado !== Number(r.prod.estoque_atual ?? 0),
      )
      .map((r) => ({
        ...r,
        diff: +(r.contado - Number(r.prod.estoque_atual ?? 0)).toFixed(3),
      }));
  }, [produtos, counts]);

  const impactoValor = useMemo(
    () => divergencias.reduce((s, d) => s + d.diff * Number(d.prod.preco_custo ?? 0), 0),
    [divergencias],
  );

  const lista = useMemo(() => {
    let base = produtos ?? [];
    if (busca.trim()) {
      const s = busca.toLowerCase();
      const sDig = s.replace(/\D/g, "");
      base = base.filter((p) => {
        if (p.nome.toLowerCase().includes(s)) return true;
        // Pesquisa por estoque/custo: "25,00" acha 25.00 (a partir de 2 dígitos)
        if (sDig.length >= 2) {
          for (const v of [p.estoque_atual, p.preco_custo]) {
            if (Number(v || 0).toFixed(2).replace(/\D/g, "").includes(sDig)) return true;
          }
        }
        return false;
      });
    }
    if (somenteDiverg) {
      const ids = new Set(divergencias.map((d) => d.prod.id));
      base = base.filter((p) => ids.has(p.id));
    }
    return base;
  }, [produtos, busca, somenteDiverg, divergencias]);

  const aplicarMut = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!divergencias.length) throw new Error("Nenhuma divergência para lançar");
      const obsBase = `Inventário ${new Date().toLocaleDateString("pt-BR")}`;
      const dep = depositoId && depositoId !== "sem-deposito" ? depositoId : null;
      let ok = 0;
      const erros: string[] = [];
      for (const d of divergencias) {
        const { error } = await supabase.from("movimentacoes_estoque").insert({
          empresa_id: empresa.id,
          produto_id: d.prod.id,
          tipo: "ajuste",
          quantidade: d.diff,
          deposito_id: dep,
          observacoes: `${obsBase} · sistema ${num(d.prod.estoque_atual ?? 0)} → contado ${num(d.contado)}`,
          custo_unitario: d.prod.preco_custo ?? null,
        });
        if (error) erros.push(`${d.prod.nome}: ${error.message}`);
        else ok++;
      }
      if (erros.length)
        throw new Error(`${ok} ajuste(s) lançado(s), ${erros.length} falha(s): ${erros[0]}`);
      return ok;
    },
    onSuccess: (ok) => {
      toast.success(`${ok} ajuste(s) lançado(s) — estoque atualizado`);
      setCounts({});
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-inventario"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["movs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Inventário"
        description="Contagem física dos itens. Divergências viram ajustes de estoque automaticamente."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 rounded-xl pl-10 pr-10 shadow-sm" placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="w-56">
          <Combobox value={depositoId} onChange={setDepositoId} options={[{ value: "sem-deposito", label: "Sem depósito" }, ...depositos.map((d) => ({ value: d.id, label: d.nome }))]} placeholder="Depósito (opcional)" searchPlaceholder="Digite para buscar..." emptyText="Nenhum item encontrado." />
        </div>
        <Button
          variant={somenteDiverg ? "default" : "outline"}
          onClick={() => setSomenteDiverg((v) => !v)}
        >
          Somente divergências
        </Button>
        {divergencias.length > 0 && (
          <span className="text-sm text-muted-foreground">
            Impacto no custo:{" "}
            <span
              className={`font-semibold text-tabular ${impactoValor >= 0 ? "text-success" : "text-destructive"}`}
            >
              {impactoValor >= 0 ? "+" : ""}
              {brl(impactoValor)}
            </span>
          </span>
        )}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => aplicarMut.mutate()}
            disabled={aplicarMut.isPending || !divergencias.length}
          >
            <ClipboardCheck className="mr-1 h-4 w-4" />
            {aplicarMut.isPending ? "Lançando…" : `Aplicar ${divergencias.length || ""} ajuste(s)`}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : !lista.length ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum produto listado"
          description="Cadastre produtos em Estoque › Produtos para realizar a contagem."
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Sistema</TableHead>
                <TableHead className="w-40 text-right">Contado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((p) => {
                const div = divergencias.find((d) => d.prod.id === p.id);
                const atual = Number(p.estoque_atual ?? 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell className="text-right text-tabular">
                      {num(atual)} {p.unidade ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyInput className="ml-auto h-8 w-32" prefix="" decimals={3} placeholder="0,000" value={counts[p.id] ?? ""} onChange={(v) => setCounts((c) => ({ ...c, [p.id]: v }))} />
                    </TableCell>
                    <TableCell className="text-right">
                      {div ? (
                        <Badge
                          variant="secondary"
                          className={
                            div.diff > 0
                              ? "bg-success/15 text-success"
                              : "bg-destructive/10 text-destructive"
                          }
                        >
                          {div.diff > 0 ? "+" : ""}
                          {num(div.diff)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
