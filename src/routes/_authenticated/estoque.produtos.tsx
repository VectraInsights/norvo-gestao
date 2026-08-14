import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/erp/money-input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Package, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/estoque/produtos")({
  component: Produtos,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Não foi possível carregar os produtos: {error.message}
    </div>
  ),
});

type Produto = {
  id: string;
  codigo: string | null;
  nome: string;
  unidade: string | null;
  estoque_atual: number | null;
  estoque_minimo: number | null;
  preco_custo: number | null;
  preco_venda: number | null;
  ativo: boolean;
};

const EMPTY_FORM = {
  codigo: "", nome: "", unidade: "UN",
  preco_venda: "0", preco_custo: "0",
  estoque_atual: "0", estoque_minimo: "0",
};

function Produtos() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: produtos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["produtos", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id,codigo,nome,unidade,estoque_atual,estoque_minimo,preco_custo,preco_venda,ativo")
        .eq("empresa_id", empresa!.id)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });

  const criarMut = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const nome = form.nome.trim();
      if (!nome) throw new Error("Nome é obrigatório");
      const custo = Number(form.preco_custo);
      const venda = Number(form.preco_venda);
      if (Number.isNaN(custo) || Number.isNaN(venda)) throw new Error("Preços inválidos");
      if (venda > 0 && custo > venda) throw new Error("Preço de venda menor que o custo");
      const { error } = await supabase.from("produtos").insert({
        empresa_id: empresa.id,
        codigo: form.codigo.trim() || null,
        nome,
        unidade: form.unidade.trim() || "UN",
        preco_custo: custo,
        preco_venda: venda,
        estoque_atual: Number(form.estoque_atual) || 0,
        estoque_minimo: Number(form.estoque_minimo) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto criado");
      setOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos-select-mov"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtrados = useMemo(() => {
    if (!produtos) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return produtos;
    return produtos.filter((p) =>
      p.nome.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q),
    );
  }, [produtos, busca]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    criarMut.mutate();
  };

  return (
    <>
      <PageHeader
        eyebrow="Estoque"
        title="Produtos"
        description="Cadastro de produtos, preços e saldos."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Adicionar trilha de auditoria
            </Button>
            <Dialog open={open} onOpenChange={(v) => { if (!criarMut.isPending) setOpen(v); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-1 h-4 w-4" />Novo produto</Button>
              </DialogTrigger>
            </Dialog>
          </div>
        }
      />
            <DialogContent>
              <DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <div><Label>Código</Label><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></div>
                  <div><Label>Nome</Label><Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Unidade</Label><Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} /></div>
                  <div><Label>Preço custo</Label><MoneyInput value={form.preco_custo} onChange={(v) => setForm({ ...form, preco_custo: v })} prefix="" /></div>
                  <div><Label>Preço venda</Label><MoneyInput value={form.preco_venda} onChange={(v) => setForm({ ...form, preco_venda: v })} prefix="" /></div>

                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Estoque inicial</Label><Input type="number" step="0.001" value={form.estoque_atual} onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })} /></div>
                  <div><Label>Estoque mínimo</Label><Input type="number" step="0.001" min="0" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={criarMut.isPending}>
                    {criarMut.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 max-w-sm">
        <Input placeholder="Buscar por nome ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </Card>
      ) : !filtrados.length ? (
        <EmptyState
          icon={Package}
          title={busca ? "Nenhum resultado" : "Nenhum produto"}
          description={busca ? "Ajuste o filtro de busca." : "Cadastre seu primeiro produto para começar a movimentar o estoque."}
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>UN</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Venda</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => {
                const atual = Number(p.estoque_atual ?? 0);
                const min = Number(p.estoque_minimo ?? 0);
                const baixo = min > 0 && atual <= min;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-tabular text-muted-foreground">{p.codigo ?? "—"}</TableCell>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.unidade ?? "—"}</TableCell>
                    <TableCell className="text-right text-tabular">
                      <div className="inline-flex items-center gap-2">
                        {baixo && (
                          <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">
                            <AlertTriangle className="mr-1 h-3 w-3" />baixo
                          </Badge>
                        )}
                        {num(atual)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-tabular">{brl(p.preco_custo ?? 0)}</TableCell>
                    <TableCell className="text-right text-tabular font-medium">{brl(p.preco_venda ?? 0)}</TableCell>
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
