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
import { Plus, TrendingUp } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/receber")({
  component: () => <LancamentosPage tipo="receber" />,
});

function brl(n: number) { return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

const STATUS_TONE: Record<string, string> = {
  aberto: "bg-accent text-accent-foreground",
  pago: "bg-success/15 text-success",
  parcial: "bg-warning/20 text-warning-foreground",
  vencido: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

export function LancamentosPage({ tipo }: { tipo: "receber" | "pagar" }) {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ descricao: "", valor: "", data_vencimento: format(new Date(), "yyyy-MM-dd") });

  const { data: lancamentos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["lancamentos", empresa?.id, tipo],
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos_financeiros")
        .select("*, contato:contatos(nome)")
        .eq("empresa_id", empresa!.id).eq("tipo", tipo)
        .order("data_vencimento", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresa) return;
    const { error } = await supabase.from("lancamentos_financeiros").insert({
      empresa_id: empresa.id, tipo, descricao: form.descricao,
      valor: Number(form.valor), data_vencimento: form.data_vencimento,
    });
    if (error) return toast.error(error.message);
    toast.success("Lançamento criado");
    setOpen(false); setForm({ descricao: "", valor: "", data_vencimento: format(new Date(), "yyyy-MM-dd") });
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const marcarPago = async (id: string, valor: number) => {
    const { error } = await supabase.from("lancamentos_financeiros")
      .update({ status: "pago", valor_pago: valor, data_pagamento: format(new Date(), "yyyy-MM-dd") }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  const titulo = tipo === "receber" ? "Contas a receber" : "Contas a pagar";
  const desc = tipo === "receber"
    ? "Recebimentos futuros e realizados."
    : "Compromissos financeiros a vencer e pagos.";

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title={titulo}
        description={desc}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" />Novo lançamento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo lançamento — {titulo}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Descrição</Label><Input required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Valor (R$)</Label><Input required type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
                  <div><Label>Vencimento</Label><Input required type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} /></div>
                </div>
                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
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
              {lancamentos.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.descricao}</TableCell>
                  <TableCell className="text-muted-foreground">{l.contato?.nome ?? "—"}</TableCell>
                  <TableCell className="text-tabular">{format(new Date(l.data_vencimento), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(l.valor)}</TableCell>
                  <TableCell><Badge className={STATUS_TONE[l.status]} variant="secondary">{l.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {l.status !== "pago" && l.status !== "cancelado" && (
                      <Button variant="ghost" size="sm" onClick={() => marcarPago(l.id, l.valor)}>Marcar pago</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
