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
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar o inventário: {error.message}
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
      const { data, error } = await supabase
        .from("produtos")
        .select("id,nome,unidade,estoque_atual,preco_custo")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as ProdInv[];
    },
  });

  const { data: depositos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["depositos-inventario", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("depositos")
        .select("id,nome")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
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
      base = base.filter((p) => p.nome.toLowerCase().includes(s));
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
        actions={
          <Button
            onClick={() => aplicarMut.mutate()}
            disabled={aplicarMut.isPending || !divergencias.length}
          >
            <ClipboardCheck className="mr-1 h-4 w-4" />
            {aplicarMut.isPending ? "Lançando…" : `Aplicar ${divergencias.length || ""} ajuste(s)`}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar produto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={depositoId} onValueChange={setDepositoId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Depósito (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sem-deposito">Sem depósito</SelectItem>
            {depositos.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <Table>
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
                      <Input
                        type="number"
                        step="0.001"
                        className="ml-auto h-8 w-32 text-right"
                        placeholder="—"
                        value={counts[p.id] ?? ""}
                        onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                      />
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
