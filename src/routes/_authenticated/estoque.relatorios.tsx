import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { BarChart3, Boxes, Coins, Gauge, TimerOff } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl, dateBR, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque/relatorios")({
  component: RelatoriosEstoque,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar os relatórios: {error.message}
    </div>
  ),
});

type ProdRel = {
  id: string;
  nome: string;
  unidade: string | null;
  estoque_atual: number | null;
  preco_custo: number | null;
};

type MovSaida = {
  produto_id: string;
  quantidade: number;
  data: string;
};

const CLASSE_COR: Record<string, string> = {
  A: "bg-success/15 text-success",
  B: "bg-warning/20 text-warning-foreground",
  C: "bg-muted text-muted-foreground",
};

function RelatoriosEstoque() {
  const { data: empresa } = useEmpresaAtual();
  const [janelaParados, setJanelaParados] = useState("90");

  const { data: produtos, isLoading: loadingProd } = useQuery({
    enabled: !!empresa,
    queryKey: ["produtos-rel", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id,nome,unidade,estoque_atual,preco_custo")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as ProdRel[];
    },
  });

  const { data: saidas, isLoading: loadingMovs } = useQuery({
    enabled: !!empresa,
    queryKey: ["saidas-rel", empresa?.id],
    queryFn: async ({ signal }) => {
      const desde = new Date();
      desde.setFullYear(desde.getFullYear() - 1);
      const { data, error } = await supabase
        .from("movimentacoes_estoque")
        .select("produto_id,quantidade,data")
        .eq("empresa_id", empresa!.id)
        .eq("tipo", "saida")
        .gte("data", desde.toISOString().slice(0, 10))
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as MovSaida[];
    },
  });
  const analise = useMemo(() => {
    const prods = produtos ?? [];
    // Consumo valorado ao CUSTO PADRÃO do produto (custo_unitario das saídas de venda
    // guarda preço de venda, não custo — ver trigger tg_venda_faturada).
    const consumo = new Map<string, { valor: number; qtd: number; ultima: string | null }>();
    for (const s of saidas ?? []) {
      const p = prods.find((x) => x.id === s.produto_id);
      if (!p) continue;
      const e = consumo.get(s.produto_id) ?? { valor: 0, qtd: 0, ultima: null };
      e.valor += Number(s.quantidade) * Number(p.preco_custo ?? 0);
      e.qtd += Number(s.quantidade);
      if (!e.ultima || s.data > e.ultima) e.ultima = s.data;
      consumo.set(s.produto_id, e);
    }

    const valorEstoque = prods.reduce(
      (s, p) => s + Number(p.estoque_atual ?? 0) * Number(p.preco_custo ?? 0),
      0,
    );
    const consumoTotal = [...consumo.values()].reduce((s, e) => s + e.valor, 0);

    // Curva ABC por valor de consumo (80/95)
    const ordenados = prods
      .map((p) => ({ prod: p, ...(consumo.get(p.id) ?? { valor: 0, qtd: 0, ultima: null }) }))
      .sort((a, b) => b.valor - a.valor);
    let acum = 0;
    const abc = ordenados.map((r) => {
      const pctPart = consumoTotal > 0 ? (r.valor / consumoTotal) * 100 : 0;
      acum += r.valor;
      const pctAcum = consumoTotal > 0 ? (acum / consumoTotal) * 100 : 100;
      const classe = !r.valor ? "C" : pctAcum <= 80 ? "A" : pctAcum <= 95 ? "B" : "C";
      return { ...r, pctPart, pctAcum, classe };
    });

    // Itens parados: com saldo e sem saída há N dias (ou nunca no período)
    const limite = new Date();
    limite.setDate(limite.getDate() - Number(janelaParados));
    const hojeStr = limite.toISOString().slice(0, 10);
    const parados = prods
      .filter((p) => Number(p.estoque_atual ?? 0) > 0)
      .map((p) => {
        const ult = consumo.get(p.id)?.ultima ?? null;
        return {
          prod: p,
          ultima: ult,
          diasParado: ult
            ? Math.floor((Date.now() - new Date(ult + "T12:00:00").getTime()) / 86400000)
            : null,
        };
      })
      .filter((r) => !r.ultima || r.ultima < hojeStr)
      .sort(
        (a, b) =>
          (b.prod.preco_custo ?? 0) * Number(b.prod.estoque_atual ?? 0) -
          (a.prod.preco_custo ?? 0) * Number(a.prod.estoque_atual ?? 0),
      );
    const valorParado = parados.reduce(
      (s, r) => s + Number(r.prod.estoque_atual ?? 0) * Number(r.prod.preco_custo ?? 0),
      0,
    );

    return {
      valorEstoque,
      consumoTotal,
      giroGlobal: valorEstoque > 0 ? consumoTotal / valorEstoque : 0,
      abc,
      parados,
      valorParado,
    };
  }, [produtos, saidas, janelaParados]);

  const loading = loadingProd || loadingMovs;

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Relatórios de estoque"
        description="Curva ABC, giro e itens parados — últimos 12 meses, valor ao custo padrão."
        actions={
          <Select value={janelaParados} onValueChange={setJanelaParados}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="60">Parados há 60+ dias</SelectItem>
              <SelectItem value="90">Parados há 90+ dias</SelectItem>
              <SelectItem value="180">Parados há 180+ dias</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Coins className="h-4 w-4" /> Valor em estoque
              </div>
              <div className="mt-1 text-2xl font-semibold text-tabular">
                {brl(analise.valorEstoque)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Boxes className="h-4 w-4" /> Consumo 12 meses
              </div>
              <div className="mt-1 text-2xl font-semibold text-tabular">
                {brl(analise.consumoTotal)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Gauge className="h-4 w-4" /> Giro anual
              </div>
              <div className="mt-1 text-2xl font-semibold text-tabular">
                {num(+analise.giroGlobal.toFixed(2))}×
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TimerOff className="h-4 w-4" /> Itens parados
              </div>
              <div className="mt-1 text-2xl font-semibold text-tabular">
                {analise.parados.length}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {brl(analise.valorParado)}
                </span>
              </div>
            </Card>
          </div>

          {!produtos?.length ? (
            <EmptyState
              icon={BarChart3}
              title="Sem produtos cadastrados"
              description="Cadastre itens em Estoque › Produtos para gerar indicadores."
            />
          ) : (
            <>
              <h3 className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Curva ABC por consumo
              </h3>
              <Card className="mb-6 overflow-hidden shadow-panel">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Consumo 12m</TableHead>
                      <TableHead className="text-right">% do total</TableHead>
                      <TableHead className="text-right">% acumulado</TableHead>
                      <TableHead>Classe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analise.abc.slice(0, 15).map((r) => (
                      <TableRow key={r.prod.id}>
                        <TableCell className="font-medium">{r.prod.nome}</TableCell>
                        <TableCell className="text-right text-tabular">{brl(r.valor)}</TableCell>
                        <TableCell className="text-right text-tabular">
                          {r.pctPart.toFixed(1).replace(".", ",")}%
                        </TableCell>
                        <TableCell className="text-right text-tabular">
                          {Math.min(r.pctAcum, 100).toFixed(1).replace(".", ",")}%
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={CLASSE_COR[r.classe]}>
                            {r.classe}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Itens parados (dinheiro parado no estoque)
              </h3>
              <Card className="overflow-hidden shadow-panel">
                {!analise.parados.length ? (
                  <div className="p-6 text-sm text-muted-foreground">
                    Nenhum item parado na janela selecionada.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Valor parado</TableHead>
                        <TableHead className="text-right">Última saída</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analise.parados.map((r) => (
                        <TableRow key={r.prod.id}>
                          <TableCell className="font-medium">{r.prod.nome}</TableCell>
                          <TableCell className="text-right text-tabular">
                            {num(r.prod.estoque_atual ?? 0)} {r.prod.unidade ?? ""}
                          </TableCell>
                          <TableCell className="text-right text-tabular">
                            {brl(
                              Number(r.prod.estoque_atual ?? 0) * Number(r.prod.preco_custo ?? 0),
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {r.ultima
                              ? `${dateBR(r.ultima)} (${r.diasParado}d)`
                              : "nunca no período"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
