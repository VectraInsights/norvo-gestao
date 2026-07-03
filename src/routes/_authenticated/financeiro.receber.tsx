import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, TrendingUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/receber")({
  component: () => <LancamentosPage tipo="receber" />,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_TONE: Record<string, string> = {
  aberto: "bg-accent text-accent-foreground",
  pago: "bg-success/15 text-success",
  parcial: "bg-warning/20 text-warning-foreground",
  vencido: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

type Lancamento = {
  id: string;
  descricao: string;
  valor: number;
  status: string;
  data_vencimento: string;
  contato: { nome: string } | null;
};

const emptyForm = () => ({
  descricao: "", valor: "",
  data_emissao: format(new Date(), "yyyy-MM-dd"),
  data_vencimento: format(new Date(), "yyyy-MM-dd"),
  contato_id: "", categoria_id: "", conta_bancaria_id: "",
  documento: "", observacoes: "",
});

export function LancamentosPage({ tipo }: { tipo: "receber" | "pagar" }) {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const listKey = ["lancamentos", empresa?.id, tipo] as const;

  const { data: lancamentos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: listKey,
    queryFn: async ({ signal }): Promise<Lancamento[]> => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .select("id,descricao,valor,status,data_vencimento,contato:contatos(nome)")
        .eq("empresa_id", empresa!.id)
        .eq("tipo", tipo)
        .order("data_vencimento", { ascending: false })
        .limit(100)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Lancamento[];
    },
  });

  const { data: contatosOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-opt", empresa?.id, tipo] as const,
    queryFn: async () => {
      const tipos = (tipo === "receber" ? ["cliente", "ambos"] : ["fornecedor", "ambos"]) as ("cliente" | "fornecedor" | "ambos")[];
      const { data, error } = await supabase.from("contatos")
        .select("id,nome,tipo").eq("empresa_id", empresa!.id).in("tipo", tipos).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contasOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-opt", empresa?.id] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco").eq("empresa_id", empresa!.id).eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categoriasOpt } = useQuery({
    enabled: !!empresa,
    queryKey: ["categorias-opt", empresa?.id, tipo] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_financeiras")
        .select("id,nome").eq("empresa_id", empresa!.id).eq("tipo", tipo).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["fluxo"] });
  };

  // useMutation dá: guard de in-flight (impede double-submit / double-click),
  // rollback em erro e centralização do invalidateQueries.
  const criar = useMutation({
    mutationFn: async (input: typeof form) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const valor = Number(input.valor);
      if (!(valor > 0)) throw new Error("Valor deve ser maior que zero");
      const { error } = await supabase.from("lancamentos_financeiros").insert({
        empresa_id: empresa.id,
        tipo,
        descricao: input.descricao,
        valor,
        data_emissao: input.data_emissao,
        data_vencimento: input.data_vencimento,
        contato_id: input.contato_id || null,
        categoria_id: input.categoria_id || null,
        conta_bancaria_id: input.conta_bancaria_id || null,
        documento: input.documento || null,
        observacoes: input.observacoes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento criado");
      setOpen(false);
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Guard `status = 'aberto'` na UPDATE evita marcar duas vezes o mesmo título
  // se dois usuários clicarem simultaneamente (defensa além da RLS).
  const marcarPago = useMutation({
    mutationFn: async (l: Pick<Lancamento, "id" | "valor">) => {
      const { data, error } = await supabase
        .from("lancamentos_financeiros")
        .update({ status: "pago", valor_pago: l.valor, data_pagamento: format(new Date(), "yyyy-MM-dd") })
        .eq("id", l.id)
        .in("status", ["aberto", "parcial", "vencido"])
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Já foi baixado por outro usuário");
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const titulo = tipo === "receber" ? "Contas a receber" : "Contas a pagar";
  const desc = tipo === "receber" ? "Recebimentos futuros e realizados." : "Compromissos financeiros a vencer e pagos.";

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title={titulo}
        description={desc}
        actions={
          <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending) setOpen(v); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" />Novo lançamento</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>Novo lançamento — {titulo}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); criar.mutate(form); }} className="space-y-3">
                <div>
                  <Label>Descrição *</Label>
                  <Input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Valor (R$) *</Label>
                    <Input required type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
                  </div>
                  <div>
                    <Label>Emissão</Label>
                    <Input type="date" value={form.data_emissao} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
                  </div>
                  <div>
                    <Label>Vencimento *</Label>
                    <Input required type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>{tipo === "receber" ? "Cliente" : "Fornecedor"}</Label>
                  <Select value={form.contato_id} onValueChange={(v) => setForm({ ...form, contato_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar contato" /></SelectTrigger>
                    <SelectContent>
                      {contatosOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Conta bancária</Label>
                    <Select value={form.conta_bancaria_id} onValueChange={(v) => setForm({ ...form, conta_bancaria_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {contasOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {categoriasOpt?.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Nº documento / NF</Label>
                  <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={criar.isPending}>
                    {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="space-y-2" aria-label="Carregando">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      ) : !lancamentos?.length ? (
        <EmptyState icon={TrendingUp} title="Sem lançamentos" description={`Crie o primeiro lançamento de ${titulo.toLowerCase()}.`} />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lancamentos.map((l) => {
                const emAndamento = marcarPago.isPending && marcarPago.variables?.id === l.id;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">{l.contato?.nome ?? "—"}</TableCell>
                    <TableCell className="text-tabular">{format(new Date(l.data_vencimento), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-right text-tabular font-medium">{brl(l.valor)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONE[l.status] ?? ""} variant="secondary">{l.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {l.status !== "pago" && l.status !== "cancelado" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={emAndamento}
                          onClick={() => marcarPago.mutate({ id: l.id, valor: l.valor })}
                        >
                          {emAndamento && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}Marcar pago
                        </Button>
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
