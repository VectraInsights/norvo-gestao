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
import { Wallet, Plus, CheckCircle2 } from "lucide-react";
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
  colaboradores?: { nome: string; salario_base: number } | null;
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function FolhaPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [colaborador, setColaborador] = useState("");
  const [salario, setSalario] = useState("0");
  const [extras, setExtras] = useState("0");
  const [beneficios, setBeneficios] = useState("0");
  const [descontos, setDescontos] = useState("0");
  const [inss, setInss] = useState("0");
  const [irrf, setIrrf] = useState("0");

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

  const liquido = useMemo(() => {
    const n = (v: string) => Number(v) || 0;
    return n(salario) + n(extras) + n(beneficios) - n(descontos) - n(inss) - n(irrf);
  }, [salario, extras, beneficios, descontos, inss, irrf]);

  const reset = () => {
    setColaborador(""); setSalario("0"); setExtras("0"); setBeneficios("0");
    setDescontos("0"); setInss("0"); setIrrf("0");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione empresa");
      if (!colaborador) throw new Error("Selecione colaborador");
      const payload: any = {
        empresa_id: empresa.id, colaborador_id: colaborador,
        competencia_mes: mes, competencia_ano: ano,
        salario: Number(salario) || 0, horas_extras: Number(extras) || 0,
        beneficios: Number(beneficios) || 0, descontos: Number(descontos) || 0,
        inss: Number(inss) || 0, irrf: Number(irrf) || 0,
        liquido,
      };
      const { error } = await (supabase.from("folha_pagamento" as never) as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folha lançada");
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

  const total = folhas?.reduce((s, f) => s + Number(f.liquido || 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folha de pagamento"
        description="Gere a folha mensal por colaborador. Ao marcar como paga, um lançamento é criado automaticamente em Contas a pagar."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo lançamento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Novo lançamento de folha</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Colaborador</Label>
                  <Select value={colaborador} onValueChange={(v) => {
                    setColaborador(v);
                    const c = colabs.find((x) => x.id === v);
                    if (c) setSalario(String(c.salario_base ?? 0));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Salário</Label><MoneyInput value={salario} onChange={setSalario} /></div>
                  <div><Label>Horas extras</Label><MoneyInput value={extras} onChange={setExtras} /></div>
                  <div><Label>Benefícios</Label><MoneyInput value={beneficios} onChange={setBeneficios} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Descontos</Label><MoneyInput value={descontos} onChange={setDescontos} /></div>
                  <div><Label>INSS</Label><MoneyInput value={inss} onChange={setInss} /></div>
                  <div><Label>IRRF</Label><MoneyInput value={irrf} onChange={setIrrf} /></div>
                </div>
                <div className="flex justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Líquido</span>
                  <span className="font-semibold text-tabular">{brl(liquido)}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>Lançar</Button>
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
                <TableHead className="w-24"></TableHead>
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
                  <TableCell>
                    {f.status !== "paga" && (
                      <Button variant="ghost" size="sm" onClick={() => pay.mutate(f.id)} disabled={pay.isPending}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />Pagar
                      </Button>
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
