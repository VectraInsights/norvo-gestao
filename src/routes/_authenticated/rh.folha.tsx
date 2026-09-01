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
  lancamento_id: string | null;
  descontos_detalhe: Array<{ nome: string; valor: number }> | null;
  colaboradores?: { nome: string; salario_base: number } | null;
};

type DescontoItem = { nome: string; valor: number };

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/* ─── Tabelas INSS 2026 (alíquota progressiva) ─── */
const INSS_FAIXAS = [
  { limite: 1621.00, aliquota: 0.075 },
  { limite: 2902.84, aliquota: 0.09 },
  { limite: 4354.27, aliquota: 0.12 },
  { limite: 8475.55, aliquota: 0.14 },
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
  return Math.min(Math.round(inss * 100) / 100, 988.09);
}

/* ─── Tabelas IRRF 2026 (Lei 15.270/2025 — alíquota progressiva, dedução) ─── */
const IRRF_FAIXAS = [
  { limite: 2428.80,  aliquota: 0,      deducao: 0 },
  { limite: 2826.65,  aliquota: 0.075,  deducao: 182.16 },
  { limite: 3751.05,  aliquota: 0.15,   deducao: 394.16 },
  { limite: 4664.68,  aliquota: 0.225,  deducao: 675.49 },
  { limite: Infinity,  aliquota: 0.275,  deducao: 908.73 },
];

function calcIRRF(baseCalculo: number, salarioBruto: number): number {
  let imposto = 0;
  for (const faixa of IRRF_FAIXAS) {
    if (baseCalculo <= faixa.limite) {
      imposto = Math.max(0, baseCalculo * faixa.aliquota - faixa.deducao);
      break;
    }
  }
  if (imposto <= 0) return 0;
  // Lei 15.270/2025 — redução do imposto
  if (salarioBruto <= 5000) {
    return 0;
  } else if (salarioBruto <= 7350) {
    const reducao = 978.62 - (0.133145 * salarioBruto);
    return Math.round(Math.max(0, imposto - reducao) * 100) / 100;
  }
  return Math.round(imposto * 100) / 100;
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
        .select("id,nome,salario_base,optante_vt").eq("empresa_id", empresa!.id).eq("status", "ativo").order("nome");
      return (data ?? []) as unknown as { id: string; nome: string; salario_base: number; optante_vt: boolean }[];
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
    return base > 0 ? calcIRRF(base, n(salario)) : 0;
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
      const f = folhas?.find((x) => x.id === id);
      if (!f) throw new Error("Lançamento não encontrado");
      if (!empresa?.id) throw new Error("Empresa não selecionada");

      // Buscar/criar categoria "Salário" (ilike estava com %sal%C3%A1rio% url-encoded e nunca casava)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cats } = await (supabase.from("categorias_financeiras") as any)
        .select("id").eq("empresa_id", empresa.id)
        .eq("tipo", "pagar").ilike("nome", "%Salário%").limit(1);
      let catId: string | null = cats?.[0]?.id ?? null;
      if (!catId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: nc, error: eCat } = await (supabase.from("categorias_financeiras") as any)
          .insert({ empresa_id: empresa.id, nome: "Salário", tipo: "pagar" })
          .select("id").single();
        if (eCat) {
          // Se já existe (race / duplicata), tenta buscar novamente
          if ((eCat as any).code === "23505") {
            const { data: retry } = await (supabase.from("categorias_financeiras") as any)
              .select("id").eq("empresa_id", empresa.id).eq("tipo", "pagar").ilike("nome", "%Salário%").limit(1);
            if (retry?.[0]?.id) catId = retry[0].id;
            else throw new Error("Já existe uma categoria com esse nome");
          } else throw eCat;
        } else catId = nc.id;
      }

      const hoje = new Date().toISOString().slice(0, 10);

      // Criar lançamento como "aberto"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lanc, error: eLanc } = await (supabase.from("lancamentos_financeiros") as any).insert({
        empresa_id: empresa.id, tipo: "pagar", status: "aberto",
        descricao: `${f.colaboradores?.nome ?? ""} — ${String(f.competencia_mes).padStart(2, "0")}/${f.competencia_ano}`,
        valor: f.liquido, data_emissao: hoje, data_vencimento: hoje,
        categoria_id: catId,
      }).select("id").single();
      if (eLanc) throw eLanc;

      // Atualizar folha para "lançada" e vincular ao lançamento
      const { error } = await (supabase.from("folha_pagamento" as never) as any)
        .update({ status: "lançada", lancamento_id: lanc.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta a pagar criada");
      qc.invalidateQueries({ queryKey: ["folha"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (f: Folha) => {
      if (f.lancamento_id) {
        const { data: lanc } = await (supabase.from("lancamentos_financeiros" as never)
          .select("status").eq("id", f.lancamento_id).maybeSingle() as any);
        if (lanc && lanc.status !== "pago") {
          const { error: eDel } = await supabase.from("lancamentos_financeiros").delete().eq("id", f.lancamento_id);
          if (eDel) throw eDel;
        }
      }
      const { error } = await supabase.from("folha_pagamento" as never).delete().eq("id", f.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento excluído");
      qc.invalidateQueries({ queryKey: ["folha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gerarEmLote = useMutation({
    mutationFn: async (_seed: number): Promise<number> => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const abertas = (folhas ?? []).filter((f) => f.status === "aberta" && !f.lancamento_id);
      if (abertas.length === 0) throw new Error("Nenhum lançamento aberto para gerar conta a pagar");

      const { data: cats } = await (supabase.from("categorias_financeiras") as any)
        .select("id").eq("empresa_id", empresa.id)
        .eq("tipo", "pagar").ilike("nome", "%Salário%").limit(1);
      let catId: string | null = cats?.[0]?.id ?? null;
      if (!catId) {
        const { data: nc, error: eCat } = await (supabase.from("categorias_financeiras") as any)
          .insert({ empresa_id: empresa.id, nome: "Salário", tipo: "pagar" })
          .select("id").single();
        if (eCat) {
          if ((eCat as any).code === "23505") {
            const { data: retry } = await (supabase.from("categorias_financeiras") as any)
              .select("id").eq("empresa_id", empresa.id).eq("tipo", "pagar").ilike("nome", "%Salário%").limit(1);
            if (retry?.[0]?.id) catId = retry[0].id;
            else throw new Error("Já existe uma categoria com esse nome");
          } else throw eCat;
        } else catId = nc.id;
      }

      const hoje = new Date().toISOString().slice(0, 10);
      let geradas = 0;
      for (const f of abertas) {
        const { data: lanc, error: eLanc } = await (supabase.from("lancamentos_financeiros") as any).insert({
          empresa_id: empresa.id, tipo: "pagar", status: "aberto",
          descricao: `${f.colaboradores?.nome ?? ""} — ${String(f.competencia_mes).padStart(2, "0")}/${f.competencia_ano}`,
          valor: f.liquido, data_emissao: hoje, data_vencimento: hoje,
          categoria_id: catId,
        }).select("id").single();
        if (eLanc) throw eLanc;
        const { error } = await (supabase.from("folha_pagamento" as never) as any)
          .update({ status: "lançada", lancamento_id: lanc.id }).eq("id", f.id);
        if (error) throw error;
        geradas++;
      }
      return geradas;
    },
    onSuccess: (_, vars) => {
      toast.success(`${vars} conta(s) a pagar gerada(s)`);
      qc.invalidateQueries({ queryKey: ["folha"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = folhas?.reduce((s, f) => s + Number(f.liquido || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folha de pagamento"
        description="Gere a folha mensal por colaborador. INSS e IRRF são calculados automaticamente. Ao criar, um lançamento é gerado em Contas a pagar."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={gerarEmLote.isPending || !(folhas ?? []).some(f => f.status === "aberta" && !f.lancamento_id)}
              onClick={() => { if (confirm(`Gerar conta(s) a pagar para ${(folhas ?? []).filter(f => f.status === "aberta" && !f.lancamento_id).length} lançamento(s) aberto(s)?`)) gerarEmLote.mutate(0); }}>
              <HandCoins className="h-4 w-4 mr-1" />Gerar contas a pagar
            </Button>
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
                    if (c && !editing) {
                      setSalario(String(c.salario_base ?? 0));
                      // auto-adiciona VT se optante
                      setDescontosItens((prev) => {
                        const semVT = prev.filter((d) => d.nome !== "Vale-Transporte");
                        if (c.optante_vt && c.salario_base > 0) {
                          const vt = Math.round(c.salario_base * 0.06 * 100) / 100;
                          return [...semVT, { nome: "Vale-Transporte", valor: vt }];
                        }
                        return semVT;
                      });
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {colabs.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}{c.optante_vt ? " (VT)" : ""}
                        </SelectItem>
                      ))}
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
                    <span className="text-muted-foreground">INSS</span>
                    <span className="float-right font-semibold text-tabular">{brl(inssCalc)}</span>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">IRRF</span>
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
          </div>
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
                      f.status === "lançada" ? "bg-sky-500/10 text-sky-600" :
                      "bg-amber-500/10 text-amber-600"
                    }`}>{f.status}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {f.status !== "cancelada" && (
                        <>
                          {f.status !== "paga" && f.status !== "lançada" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => pay.mutate(f.id)} disabled={pay.isPending}>
                                  <HandCoins className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Gerar conta a pagar</TooltipContent>
                            </Tooltip>
                          )}
                          {f.status !== "paga" && f.status !== "lançada" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => abrirEdicao(f)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir" onClick={() => {
                            if (confirm(f.lancamento_id ? "Excluir este lançamento da folha?\n\nA conta a pagar vinculada também será removida." : "Excluir este lançamento da folha?")) excluir.mutate(f);
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
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
