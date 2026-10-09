import { MoneyInput } from "@/components/erp/money-input";
import { Combobox } from "@/components/erp/combobox";
import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
import { PackagePlus, AlertTriangle, ShoppingCart, Trash2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque/reposicao")({
  component: Reposicao,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center shadow-sm animate-in fade-in zoom-in duration-300 sm:p-10"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="mt-4 text-base font-semibold tracking-tight text-foreground">
        Não foi possível carregar a reposição
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Erro desconhecido"}
      </p>
    </div>
  ),
});

type ProdRep = {
  id: string;
  nome: string;
  unidade: string | null;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  preco_custo: number | null;
};

type LinhaRep = { incluir: boolean; qtd: string };

/** Sugestão de compra: repõe o mínimo e deixa margem p/ não recair no limite. */
const sugerir = (p: ProdRep): number => {
  const atual = Number(p.estoque_atual ?? 0);
  const min = Number(p.estoque_minimo ?? 0);
  return Math.max(2 * min - atual, min, 1);
};

function Reposicao() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [linhas, setLinhas] = useState<Record<string, LinhaRep>>({});
  const [fornecedor, setFornecedor] = useState("");
  const [contaBanco, setContaBanco] = useState("");
  const [depositoId, setDepositoId] = useState("");
  const [dataPrev, setDataPrev] = useState("");
  const [busca, setBusca] = useState("");

  const { data: produtos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["produtos-reposicao", empresa?.id],
    queryFn: async ({ signal }) => {
      // Busca em páginas: sem range, o Supabase corta em 1000 (sem aviso)
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("produtos")
          .select("id,nome,unidade,estoque_atual,estoque_minimo,preco_custo")
          .eq("empresa_id", empresa!.id)
          .eq("ativo", true)
          .order("nome")
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as ProdRep[];
    },
  });
  const criticos = useMemo(
    () =>
      (produtos ?? [])
        .filter(
          (p) =>
            Number(p.estoque_minimo ?? 0) > 0 &&
            Number(p.estoque_atual ?? 0) <= Number(p.estoque_minimo ?? 0),
        )
        .sort(
          (a, b) =>
            Number(a.estoque_atual ?? 0) / Number(a.estoque_minimo || 1) -
            Number(b.estoque_atual ?? 0) / Number(b.estoque_minimo || 1),
        ),
    [produtos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return criticos;
    const qDig = q.replace(/\D/g, "");
    return criticos.filter((p) => {
      if ((p.nome || "").toLowerCase().includes(q)) return true;
      // Pesquisa por custo: "25,00" acha 25.00 (a partir de 2 dígitos)
      if (qDig.length >= 2 && Number(p.preco_custo || 0).toFixed(2).replace(/\D/g, "").includes(qDig)) return true;
      return false;
    });
  }, [criticos, busca]);

  const linhaDe = (p: ProdRep): LinhaRep =>
    linhas[p.id] ?? { incluir: true, qtd: String(sugerir(p)) };

  const selecionados = useMemo(
    () =>
      filtrados
        .map((p) => ({ prod: p, ...linhaDe(p) }))
        .filter((l) => l.incluir && Number(l.qtd.replace(",", ".")) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtrados, linhas],
  );

  const valorEstimado = useMemo(
    () =>
      selecionados.reduce(
        (s, l) => s + Number(l.qtd.replace(",", ".")) * Number(l.prod.preco_custo ?? 0),
        0,
      ),
    [selecionados],
  );

  const { data: fornecedores = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-fornecedor-rep", empresa?.id],
    queryFn: async ({ signal }) => {
      // Busca em páginas: sem range, o Supabase corta em 1000 (sem aviso)
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("contatos")
          .select("id,nome")
          .eq("empresa_id", empresa!.id)
          .in("tipo", ["fornecedor", "ambos"])
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

  const { data: contas = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-rep", empresa?.id],
    queryFn: async ({ signal }) => {
      // Busca em páginas: sem range, o Supabase corta em 1000 (sem aviso)
      const todos: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase
          .from("contas_bancarias")
          .select("id,nome")
          .eq("empresa_id", empresa!.id)
          .range(ini, ini + 999)
          .abortSignal(signal);
        if (error) throw error;
        todos.push(...((data as unknown[]) ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todos as { id: string; nome: string }[];
    },
  });

  const { data: depositos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["depositos-rep", empresa?.id],
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

  const gerarOC = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      if (!fornecedor) throw new Error("Selecione um fornecedor");
      if (!selecionados.length) throw new Error("Marque ao menos um produto com quantidade");

      const { data: oc, error } = await supabase
        .from("ordens_compra" as never)
        .insert({
          empresa_id: empresa.id,
          fornecedor_id: fornecedor,
          data_prevista: dataPrev || null,
          conta_bancaria_id: contaBanco || null,
          deposito_id: depositoId && depositoId !== "sem-deposito" ? depositoId : null,
          observacoes: `Reposição automática — estoque mínimo (${new Date().toLocaleDateString("pt-BR")})`,
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      const rows = selecionados.map((l) => {
        const qtd = Number(l.qtd.replace(",", "."));
        const custo = Number(l.prod.preco_custo ?? 0);
        return {
          ordem_id: (oc as { id: string }).id,
          produto_id: l.prod.id,
          quantidade: qtd,
          custo_unitario: custo,
          subtotal: +(qtd * custo).toFixed(2),
        };
      });
      const { error: e2 } = await supabase
        .from("ordens_compra_itens" as never)
        .insert(rows as never);
      if (e2) throw e2;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`Ordem de compra criada com ${n} item(s)`);
      setLinhas({});
      setFornecedor("");
      setContaBanco("");
      setDataPrev("");
      qc.invalidateQueries({ queryKey: ["ordens_compra"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Reposição"
        description="Itens no ou abaixo do estoque mínimo. Selecione e gere a ordem de compra de uma vez."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 rounded-xl pl-10 pr-10 shadow-sm" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => gerarOC.mutate()}
            disabled={gerarOC.isPending || !selecionados.length}
            className="h-9 rounded-xl px-4 shadow-sm transition-all hover:shadow-md active:scale-95"
          >
            <ShoppingCart className="mr-1 h-4 w-4" />
            {gerarOC.isPending ? "Gerando…" : `Gerar ordem de compra (${selecionados.length})`}
          </Button>
        </div>
      </div>

      {isLoading ? null : !criticos.length ? (
        <EmptyState
          icon={PackagePlus}
          title="Nenhum produto abaixo do mínimo"
          description="Todos os itens estão acima do estoque mínimo. Configure mínimos em Estoque › Produtos para receber sugestões."
        />
      ) : !filtrados.length ? (
        <EmptyState
          icon={PackagePlus}
          title="Nenhum produto encontrado"
          description="Nada encontrado para a busca."
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-warning" /> Itens críticos
              </div>
              <div className="mt-1 text-2xl font-semibold text-tabular">{criticos.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Selecionados</div>
              <div className="mt-1 text-2xl font-semibold text-tabular">{selecionados.length}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Valor estimado da compra</div>
              <div className="mt-1 text-2xl font-semibold text-tabular">{brl(valorEstimado)}</div>
            </Card>
          </div>

          <Card className="mb-4 grid gap-4 p-4 sm:grid-cols-4">
            <div>
              <Label>Fornecedor *</Label>
              <Combobox value={fornecedor} onChange={setFornecedor} options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))} emptyText="Nenhum item encontrado." />
            </div>
            <div>
              <Label>Depósito destino</Label>
              <Combobox value={depositoId} onChange={setDepositoId} options={[{ value: "sem-deposito", label: "Sem depósito" }, ...depositos.map((d) => ({ value: d.id, label: d.nome }))]} emptyText="Nenhum item encontrado." />
            </div>
            <div>
              <Label>Conta p/ pagamento</Label>
              <Combobox value={contaBanco} onChange={setContaBanco} options={contas.map((c) => ({ value: c.id, label: c.nome }))} emptyText="Nenhum item encontrado." />
            </div>
            <div>
              <Label>Previsão de entrega</Label>
              <DateInput value={dataPrev} onChange={setDataPrev} />
            </div>
          </Card>

          <Card className="overflow-hidden shadow-panel">
            <Table className="[&_td]:px-3 [&_th]:px-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Atual</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="w-36 text-right">Comprar</TableHead>
                  <TableHead className="text-right">Custo unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((p) => {
                  const l = linhaDe(p);
                  const qtdNum = Number(l.qtd.replace(",", "."));
                  const custo = Number(p.preco_custo ?? 0);
                  return (
                    <TableRow key={p.id} className={l.incluir ? "" : "opacity-50"}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={l.incluir}
                          onChange={(e) =>
                            setLinhas((r) => ({
                              ...r,
                              [p.id]: { ...l, incluir: e.target.checked },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="text-right text-tabular">
                        <span className="text-destructive">{num(p.estoque_atual ?? 0)}</span>{" "}
                        {p.unidade ?? ""}
                      </TableCell>
                      <TableCell className="text-right text-tabular">
                        {num(p.estoque_minimo ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyInput className="ml-auto h-8 w-28" prefix="" decimals={3} value={l.qtd} onChange={(v) => setLinhas((r) => ({ ...r, [p.id]: { ...l, qtd: v } }))} />
                      </TableCell>
                      <TableCell className="text-right text-tabular">{brl(custo)}</TableCell>
                      <TableCell className="text-right text-tabular">
                        {qtdNum > 0 ? brl(qtdNum * custo) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Zerar quantidade"
                          onClick={() =>
                            setLinhas((r) => ({ ...r, [p.id]: { ...l, qtd: "0", incluir: false } }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
