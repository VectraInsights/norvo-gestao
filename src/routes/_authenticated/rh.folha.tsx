import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/erp/money-input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wallet, Plus, Pencil, Trash2, HandCoins } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rh/folha")({
  component: FolhaPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
});

type Folha = {
  id: string; colaborador_id: string;
  competencia_mes: number; competencia_ano: number;
  salario: number; horas_extras: number; beneficios: number;
  descontos: number; inss: number; irrf: number; liquido: number;
  status: string; data_pagamento: string | null;
  descontos_detalhe: Array<{ nome: string; valor: number }> | null;
  colaboradores?: { nome: string; salario_base: number } | null;
};

type DescontoItem = { nome: string; valor: number };

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/* ─── Tabelas INSS 2026 (alíquota progressiva) ─── */
const INSS_FAIXAS = [
  { limite: 1412.79, aliquota: 0.075 },
  { limite: 2122.01, aliquota: 0.09 },
  { limite: 3309.01, aliquota: 0.12 },
  { limite: Infinity,  aliquota: 0.14 },
];

function calcINSS(salarioBruto: number): number {
  let inss = 0;
  let anterior = 0;
  for (const faixa of INSS_FAIXAS) {
    const base = Math.min(salarioBruto, faixa.limite) - anterior;
    if (base <= 0) break;
    inss += base * faixa.aliquota;
    anterior = faixa.limite;
  }
  return Math.round(inss * 100) / 100;
}

/* ─── Tabelas IRRF 2026 (alíquota progressiva, dedução) ─── */
const IRRF_FAIXAS = [
  { limite: 2259.20,  aliquota: 0,      deducao: 0 },
  { limite: 2826.65,  aliquota: 0.075,  deducao: 169.44 },
  { limite: 3751.05,  aliquota: 0.15,   deducao: 381.44 },
  { limite: 4664.68,  aliquota: 0.225,  deducao: 662.77 },
  { limite: Infinity,  aliquota: 0.275,  deducao: 896.00 },
];

function calcIRRF(baseCalculo: number): number {
  for (const faixa of IRRF_FAIXAS) {
    if (baseCalculo <= faixa.limite) {
      return Math.round((baseCalculo * faixa.aliquota - faixa.deducao) * 100) / 100;
    }
  }
  return 0;
}

function FolhaPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Folha | null>(null);

  const [colaborador, setColaborador] = useState("");
  const [salario, setSalario] = useState("0");
  const [extras, setExtras] = useState("0");
  const [beneficios, setBeneficios] = useState("0");
  const [descontosItens, setDescontosItens] = useState<DescontoItem[]>([]);
  const [novoDescNome, setNovoDescNome] = useState("");
  const [novoDescValor, setNovoDescValor] = useState("0");

  const { data: colabs = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores-ativos", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("colaboradores" as never)
        .select("id,nome,salario_base").eq("empresa_id", empresa!.id).eq("status", "ativo").order("nome");
      return (data ?? []) as unknown as { id: string; nome: string; salario_base: number }[];
    },
  });

  const { data: folhas, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["folha", empresa?.id, mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase.from("folha_pagamento" as never)
        .select("*, colaboradores:colaborador_id(nome,salario_base)")
        .eq("empresa_id", empresa!.id)
        .eq("competencia_mes", mes).eq("competencia_ano", ano)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Folha[];
    },
  });

  const n = (v: string) => Number(v) || 0;
  const totalDescontosItens = useMemo(
    () => descontosItens.reduce((s, d) => s + d.valor, 0),
    [descontosItens],
  );

  const inssCalc = useMemo(() => calcINSS(n(salario)), [salario]);
  const irrfCalc = useMemo(() => {
    const base = n(salario) - inssCalc;
    return base > 0 ? calcIRRF(base) : 0;
  }, [salario, inssCalc]);

  const liquido = useMemo(() => {
    return n(salario) + n(extras) + n(beneficios) - totalDescontosItens - inssCalc - irrfCalc;
  }, [salario, extras, beneficios, totalDescontosItens, inssCalc, irrfCalc]);

  const reset = () => {
    setEditing(null); setColaborador(""); setSalario("0"); setExtras("0");
    setBeneficios("0"); setDescontosItens([]); setNovoDescNome(""); setNovoDescValor("0");
  };

  const abrirEdicao = (f: Folha) => {
    setEditing(f);
    setColaborador(f.colaborador_id);
    setSalario(String(f.salario));
    setExtras(String(f.horas_extras));
    setBeneficios(String(f.beneficios));
    setDescontosItens(f.descontos_detalhe ?? []);
    setOpen(true);
  };

  const adicionarDesconto = () => {
    const nome = novoDescNome.trim();
    const valor = n(novoDescValor);
    if (!nome) throw new Error("Informe o nome do desconto");
    if (valor <= 0) throw new Error("Informe um valor positivo");
    setDescontosItens((prev) => [...prev, { nome, valor }]);
    setNovoDescNome(""); setNovoDescValor("0");
  };

  const removerDesconto = (idx: number) => {
    setDescontosItens((prev) => prev.filter((_, i) => i !== idx));
  };

  const createOrUpdate = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione empresa");
      if (!colaborador) throw new Error("Selecione colaborador");
      const payload: any = {
        empresa_id: empresa.id, colaborador_id: colaborador,
        competencia_mes: mes, competencia_ano: ano,
        salario: n(salario), horas_extras: n(extras),
        beneficios: n(beneficios), descontos: totalDescontosItens,
        inss: inssCalc, irrf: irrfCalc, liquido,
        descontos_detalhe: descontosItens,
      };
      const tbl = supabase.from("folha_pagamento" as never) as any;
      if (editing) {
        const { error } = await tbl.update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Lançamento atualizado" : "Folha lançada");
      qc.invalidateQueries({ queryKey: ["folha"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("folha_pagamento" as never) as any)
        .update({ status: "paga", data_pagamento: new Date().toISOString().slice(0, 10) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folha paga — lançamento criado em Contas a pagar");
      qc.invalidateQueries({ queryKey: ["folha"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("folha_pagamento" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento excluído");
      qc.invalidateQueries({ queryKey: ["folha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = folhas?.reduce((s, f) => s + Number(f.liquido || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folha de pagamento"
        description="Gere a folha mensal por colaborador. INSS e IRRF são calculados automaticamente. Ao marcar como paga, um lançamento é criado em Contas a pagar."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo lançamento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento de folha"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Colaborador</Label>
                  <Select value={colaborador} onValueChange={(v) => {
                    setColaborador(v);
                    const c = colabs.find((x) => x.id === v);
                    if (c && !editing) setSalario(String(c.salario_base ?? 0));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1"><Label>Salário</Label><MoneyInput value={salario} onChange={setSalario} /></div>
                  <div className="space-y-1"><Label>Horas extras</Label><MoneyInput value={extras} onChange={setExtras} /></div>
                  <div className="space-y-1"><Label>Benefícios</Label><MoneyInput value={beneficios} onChange={setBeneficios} /></div>
                </div>

                {/* INSS / IRRF calculados automaticamente */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">INSS (auto)</span>
                    <span className="float-right font-semibold text-tabular">{brl(inssCalc)}</span>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">IRRF (auto)</span>
                    <span className="float-right font-semibold text-tabular">{brl(irrfCalc)}</span>
                  </div>
                </div>

                {/* Descontos itemizados */}
                <div>
                  <Label>Descontos</Label>
                  {descontosItens.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {descontosItens.map((d, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                          <span>{d.nome}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-tabular">{brl(d.valor)}</span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => removerDesconto(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="Nome (ex.: VT, vale refeição)"
                      value={novoDescNome}
                      onChange={(e) => setNovoDescNome(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarDesconto(); } }}
                    />
                    <div className="w-32">
                      <MoneyInput value={novoDescValor} onChange={setNovoDescValor} />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={adicionarDesconto}>+</Button>
                  </div>
                </div>

                <div className="flex justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Líquido</span>
                  <span className="font-semibold text-tabular">{brl(liquido)}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => createOrUpdate.mutate()} disabled={createOrUpdate.isPending}>
                  {editing ? "Salvar" : "Lançar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Competência</Label>
          <div className="flex gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" className="w-24" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
          </div>
        </div>
        <div className="ml-auto rounded-md border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total líquido do mês: </span>
          <span className="font-semibold text-tabular">{brl(total)}</span>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6"><Skeleton className="h-32 w-full" /></div>
        ) : !folhas || folhas.length === 0 ? (
          <EmptyState icon={Wallet} title="Nenhum lançamento" description="Crie o primeiro lançamento da folha desta competência." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="text-right">Extras/Benef.</TableHead>
                <TableHead className="text-right">Descontos</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folhas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.colaboradores?.nome ?? "—"}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(f.salario)}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(Number(f.horas_extras) + Number(f.beneficios))}</TableCell>
                  <TableCell className="text-right text-tabular">{brl(Number(f.descontos) + Number(f.inss) + Number(f.irrf))}</TableCell>
                  <TableCell className="text-right text-tabular font-semibold">{brl(f.liquido)}</TableCell>
                  <TableCell>
                    <span className={`rounded-md px-2 py-0.5 text-xs ${
                      f.status === "paga" ? "bg-emerald-500/10 text-emerald-600" :
                      f.status === "cancelada" ? "bg-rose-500/10 text-rose-600" :
                      "bg-amber-500/10 text-amber-600"
                    }`}>{f.status}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {f.status !== "paga" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => abrirEdicao(f)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir" onClick={() => excluir.mutate(f.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => pay.mutate(f.id)} disabled={pay.isPending}>
                              <HandCoins className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Pagar e gerar conta a pagar</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
