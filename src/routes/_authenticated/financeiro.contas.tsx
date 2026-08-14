import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Banknote, Plus, Upload, Loader2, Link2, Check, Landmark, Wallet, CreditCard, TrendingUp, PiggyBank, DollarSign, Database, Coins, Trash2, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { parseOfxFull } from "@/lib/ofx";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { detectBancoByNome, detectBancoByCodigo, formatContaComDigito, normalizaContaNumero } from "@/lib/bancos";

export const Route = createFileRoute("/_authenticated/financeiro/contas")({
  validateSearch: (search: Record<string, unknown>): { conciliar?: string } => ({
    conciliar: typeof search.conciliar === "string" ? search.conciliar : undefined,
  }),
  component: ContasFinanceiras,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive" role="alert">Falha: {error.message}</div>
  ),
});


const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type TipoConta = "corrente" | "caixa" | "cartao_credito" | "investimento" | "poupanca" | "aplicacao_automatica" | "outras";

type ContaBancaria = {
  id: string; nome: string | null; banco: string | null;
  agencia: string | null; conta: string | null; saldo_atual: number;
  tipo: TipoConta;
};

type OfxRow = {
  id: string; data_transacao: string; valor: number; tipo: string;
  memo: string | null; status: string; lancamento_id: string | null;
};

const TIPO_PRINCIPAL: { value: TipoConta; label: string; desc: string; icon: typeof Landmark }[] = [
  { value: "corrente", label: "Conta corrente", desc: "Conecte sua conta bancária para manter o fluxo de caixa sempre conciliado.", icon: Landmark },
  { value: "caixa", label: "Conta caixa", desc: "Registre entradas e saídas em dinheiro, como caixa físico ou fundo fixo.", icon: Wallet },
  { value: "cartao_credito", label: "Cartão de crédito", desc: "Centralize faturas e despesas do cartão empresarial em uma tela exclusiva.", icon: CreditCard },
];
const TIPO_OUTROS: { value: TipoConta; label: string; desc: string; icon: typeof Landmark }[] = [
  { value: "investimento", label: "Investimento", desc: "Acompanhe aplicações e rendimentos.", icon: TrendingUp },
  { value: "poupanca", label: "Conta poupança", desc: "Controle depósitos e resgates separados da conta corrente.", icon: PiggyBank },
  { value: "aplicacao_automatica", label: "Aplicação automática", desc: "Registre aplicações automáticas entre contas da empresa.", icon: Database },
  { value: "outras", label: "Outras contas", desc: "Registre movimentos específicos, como empréstimos de sócios.", icon: Coins },
];
const TIPO_LABEL: Record<TipoConta, string> = {
  corrente: "Conta corrente", caixa: "Conta caixa", cartao_credito: "Cartão de crédito",
  investimento: "Investimento", poupanca: "Conta poupança", aplicacao_automatica: "Aplicação automática", outras: "Outras contas",
};

type FormState = {
  tipo: TipoConta;
  nome: string; banco: string; agencia: string; conta: string;
  modalidade: string; padrao: boolean; saldo_inicial: string;
  conta_vinculada_id: string;
  cartao_ultimos4: string; cartao_bandeira: string; cartao_emissor: string;
  cartao_conta_pagamento_id: string; cartao_dia_fechamento: string; cartao_dia_vencimento: string;
  data_inicio_lancamentos: string; saldo_dia_anterior: string;
};

const initialForm = (tipo: TipoConta): FormState => ({
  tipo, nome: "", banco: "", agencia: "", conta: "", modalidade: "", padrao: false, saldo_inicial: "0",
  conta_vinculada_id: "", cartao_ultimos4: "", cartao_bandeira: "", cartao_emissor: "",
  cartao_conta_pagamento_id: "", cartao_dia_fechamento: "", cartao_dia_vencimento: "",
  data_inicio_lancamentos: "", saldo_dia_anterior: "",
});


/** Concilia automaticamente (mesmo valor e mesma data) tudo o que der match.
 *  Retorna a quantidade de conciliações efetuadas. */
async function autoConciliarConta(contaId: string, empresaId: string): Promise<number> {
  const [{ data: txs }, { data: abertos }] = await Promise.all([
    supabase.from("ofx_transacoes")
      .select("id,data_transacao,valor,status")
      .eq("conta_bancaria_id", contaId).neq("status", "conciliada"),
    supabase.from("lancamentos_financeiros")
      .select("id,valor,data_vencimento")
      .eq("empresa_id", empresaId).in("status", ["aberto", "vencido", "parcial"])
      .order("data_vencimento").limit(1000),
  ]);
  if (!txs?.length || !abertos?.length) return 0;

  const usados = new Set<string>();
  const pares: { ofxId: string; lancamentoId: string; valor: number }[] = [];
  for (const tx of txs) {
    const match = abertos.find((l) =>
      !usados.has(l.id) &&
      Math.abs(Number(l.valor) - Math.abs(Number(tx.valor))) < 0.01 &&
      l.data_vencimento === tx.data_transacao
    );
    if (match) {
      usados.add(match.id);
      pares.push({ ofxId: tx.id, lancamentoId: match.id, valor: Number(tx.valor) });
    }
  }
  if (!pares.length) return 0;

  const hoje = format(new Date(), "yyyy-MM-dd");
  let ok = 0;
  for (const p of pares) {
    const { error: e1 } = await supabase.from("lancamentos_financeiros")
      .update({ status: "pago", valor_pago: Math.abs(p.valor), data_pagamento: hoje, conta_bancaria_id: contaId })
      .eq("id", p.lancamentoId);
    if (e1) continue;
    const { error: e2 } = await supabase.from("ofx_transacoes")
      .update({ status: "conciliada", lancamento_id: p.lancamentoId }).eq("id", p.ofxId);
    if (!e2) ok++;
  }
  return ok;
}

function ContasFinanceiras() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tipo, setTipo] = useState<TipoConta>("corrente");
  const [form, setForm] = useState<FormState>(initialForm("corrente"));
  const autoConciliar = true;
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [preparando, setPreparando] = useState<string | null>(null);

  const abrirConciliacao = async (id: string) => {
    if (!autoConciliar || !empresa?.id) { setReconcilingId(id); return; }
    setPreparando(id);
    try {
      const ok = await autoConciliarConta(id, empresa.id);
      if (ok > 0) {
        toast.success(`${ok} lançamento(s) conciliado(s) automaticamente`);
        qc.invalidateQueries({ queryKey: ["ofx", id] });
        qc.invalidateQueries({ queryKey: ["lanc-abertos", empresa.id] });
        qc.invalidateQueries({ queryKey: ["lancamentos"] });
      }
    } catch {
      /* segue abrindo a tela mesmo se a automação falhar */
    } finally {
      setPreparando(null);
      setReconcilingId(id);
    }
  };

  // abre automaticamente a conciliação quando vindo de /financeiro/conciliacao
  const { conciliar: conciliarParam } = Route.useSearch();
  const conciliarAberto = useRef(false);
  useEffect(() => {
    if (!conciliarParam || conciliarAberto.current || !empresa?.id) return;
    conciliarAberto.current = true;
    void abrirConciliacao(conciliarParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conciliarParam, empresa?.id]);



  const [importing, setImporting] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadContaId, setUploadContaId] = useState<string | null>(null);

  const { data: contas } = useQuery({
    enabled: !!empresa,
    queryKey: ["contas-bancarias", empresa?.id] as const,
    queryFn: async ({ signal }): Promise<ContaBancaria[]> => {
      const { data, error } = await supabase.from("contas_bancarias")
        .select("id,nome,banco,agencia,conta,saldo_atual,tipo")
        .eq("empresa_id", empresa!.id).order("banco").abortSignal(signal);
      if (error) throw error; return (data ?? []) as ContaBancaria[];
    },
  });

  const contasCorrentes = (contas ?? []).filter((c) => c.tipo === "corrente");

  const resetWizard = () => { setStep(1); setTipo("corrente"); setForm(initialForm("corrente")); };

  const criar = useMutation({
    mutationFn: async (input: FormState) => {
      if (!empresa) throw new Error("Empresa não selecionada");
      const saldo = Number(input.saldo_dia_anterior || input.saldo_inicial || 0);
      const payload: Record<string, unknown> = {
        empresa_id: empresa.id,
        tipo: input.tipo,
        nome: input.nome || input.banco || TIPO_LABEL[input.tipo],
        padrao: input.padrao,
        data_inicio_lancamentos: input.data_inicio_lancamentos || null,
        saldo_inicial: saldo, saldo_atual: saldo,
      };
      if (input.tipo === "corrente") {
        Object.assign(payload, {
          banco: input.banco, agencia: input.agencia, conta: input.conta,
          modalidade: input.modalidade || null, saldo_inicial: saldo, saldo_atual: saldo,
        });
      } else if (input.tipo === "caixa" || input.tipo === "outras") {
        Object.assign(payload, { saldo_inicial: saldo, saldo_atual: saldo });
      } else if (input.tipo === "cartao_credito") {
        Object.assign(payload, {
          cartao_ultimos4: input.cartao_ultimos4, cartao_bandeira: input.cartao_bandeira,
          cartao_emissor: input.cartao_emissor,
          cartao_conta_pagamento_id: input.cartao_conta_pagamento_id || null,
          cartao_dia_fechamento: input.cartao_dia_fechamento ? Number(input.cartao_dia_fechamento) : null,
          cartao_dia_vencimento: input.cartao_dia_vencimento ? Number(input.cartao_dia_vencimento) : null,
        });
      } else if (input.tipo === "investimento" || input.tipo === "aplicacao_automatica") {
        Object.assign(payload, {
          banco: input.banco, conta_vinculada_id: input.conta_vinculada_id || null,
        });
      } else if (input.tipo === "poupanca") {
        Object.assign(payload, {
          banco: input.banco, conta_vinculada_id: input.conta_vinculada_id || null,
          modalidade: input.modalidade || null,
        });
      }
      const { error } = await supabase.from("contas_bancarias").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta criada"); setOpen(false); resetWizard();
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      // limpa vínculos que impediriam o delete
      await supabase.from("ofx_transacoes").delete().eq("conta_bancaria_id", id);
      await supabase.from("lancamentos_financeiros").update({ conta_bancaria_id: null }).eq("conta_bancaria_id", id);
      const { error } = await supabase.from("contas_bancarias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta excluída");
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerUpload = (contaId: string) => { setUploadContaId(contaId); fileRef.current?.click(); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadContaId || !empresa) return;
    const conta = (contas ?? []).find((c) => c.id === uploadContaId);
    setImporting(uploadContaId);
    try {
      const text = await file.text();
      const { account, transactions: txs } = parseOfxFull(text);
      if (!txs.length) { toast.error("Nenhuma transação encontrada no OFX"); return; }

      // Verifica se o OFX bate com a conta cadastrada
      if (conta) {
        const problemas: string[] = [];
        const bancoOfx = detectBancoByCodigo(account.bankId);
        const bancoConta = detectBancoByNome(conta.banco);
        if (bancoOfx && bancoConta && bancoOfx.slug !== bancoConta.slug) {
          problemas.push(`Banco: OFX é ${bancoOfx.nome}, conta cadastrada é ${bancoConta.nome}`);
        } else if (bancoOfx && conta.banco && !bancoConta) {
          problemas.push(`Banco do OFX (${bancoOfx.nome}) não bate com "${conta.banco}"`);
        }
        if (account.branchId && conta.agencia) {
          const a1 = account.branchId.replace(/\D/g, "").replace(/^0+/, "");
          const a2 = conta.agencia.replace(/\D/g, "").replace(/^0+/, "");
          if (a1 && a2 && a1 !== a2) problemas.push(`Agência: OFX ${account.branchId} × conta ${conta.agencia}`);
        }
        if (account.acctId && conta.conta) {
          const c1 = normalizaContaNumero(account.acctId);
          const c2 = normalizaContaNumero(conta.conta);
          if (c1 && c2 && c1 !== c2) problemas.push(`Conta: OFX ${account.acctId} × conta ${conta.conta}`);
        }
        if (problemas.length) {
          const msg = `Este OFX parece ser de outra conta:\n\n• ${problemas.join("\n• ")}\n\nDeseja importar mesmo assim?`;
          if (!window.confirm(msg)) { toast.warning("Importação cancelada"); return; }
        }
      }

      const rows = txs.map((t) => ({
        empresa_id: empresa.id, conta_bancaria_id: uploadContaId, fitid: t.fitid,
        data_transacao: t.data, valor: t.valor, tipo: t.tipo, memo: t.memo,
      }));
      const { error, count } = await supabase.from("ofx_transacoes")
        .upsert(rows, { onConflict: "conta_bancaria_id,fitid", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      const novas = count ?? 0;
      const duplicadas = rows.length - novas;
      toast.success(`${novas} nova(s) transação(ões) importada(s)${duplicadas > 0 ? ` · ${duplicadas} já existiam` : ""}`);
      qc.invalidateQueries({ queryKey: ["ofx", uploadContaId] });
      setReconcilingId(uploadContaId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar OFX");
    } finally { setImporting(null); setUploadContaId(null); }
  };

  const podeContinuarStep2 = () => {
    if (form.tipo === "corrente") return !!form.banco && !!form.agencia && !!form.conta && !!form.nome && !!form.modalidade;
    if (form.tipo === "caixa" || form.tipo === "outras") return !!form.nome;
    if (form.tipo === "cartao_credito")
      return !!form.nome && !!form.cartao_ultimos4 && !!form.cartao_bandeira && !!form.cartao_emissor
        && !!form.cartao_conta_pagamento_id && !!form.cartao_dia_fechamento && !!form.cartao_dia_vencimento;
    if (form.tipo === "investimento" || form.tipo === "aplicacao_automatica")
      return !!form.nome && !!form.banco && !!form.conta_vinculada_id;
    if (form.tipo === "poupanca")
      return !!form.nome && !!form.banco && !!form.conta_vinculada_id && !!form.modalidade;
    return false;
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".ofx,.OFX,text/plain" className="hidden" onChange={handleFile} />
      <PageHeader eyebrow="Financeiro" title="Contas financeiras" description="Cadastro e gestão das contas financeiras da empresa."
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              Adicionar trilha de auditoria
            </Button>

            <Dialog open={open} onOpenChange={(v) => { if (!criar.isPending) { setOpen(v); if (!v) resetWizard(); } }}>
              <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />Nova conta</Button></DialogTrigger>
              <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Cadastrar conta financeira</DialogTitle></DialogHeader>

                {/* Step 1 - tipo */}
                <Card className={cn("p-4 space-y-3", step !== 1 && "opacity-70")}>
                  <div className="flex items-center gap-2">
                    <div className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      step === 1 ? "bg-muted text-muted-foreground" : "bg-success text-success-foreground")}>
                      {step === 1 ? "1" : <Check className="h-3 w-3" />}
                    </div>
                    <h3 className="font-semibold text-sm">Escolha o tipo de conta *</h3>
                    {step === 2 && <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setStep(1)}>Editar</Button>}
                  </div>
                  {step === 1 && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {TIPO_PRINCIPAL.map((t) => (
                          <TipoCard key={t.value} t={t} selected={tipo === t.value} onSelect={() => setTipo(t.value)} />
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground pt-2">Outras opções:</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {TIPO_OUTROS.map((t) => (
                          <TipoCard key={t.value} t={t} selected={tipo === t.value} onSelect={() => setTipo(t.value)} />
                        ))}
                      </div>
                      <div className="pt-3">
                        <Button onClick={() => { setForm(initialForm(tipo)); setStep(2); }}>Continuar</Button>
                      </div>
                    </>
                  )}
                </Card>

                {/* Step 2 - dados */}
                {step === 2 && (
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold">2</div>
                      <h3 className="font-semibold text-sm">Preencha os dados *</h3>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); if (podeContinuarStep2()) setStep(3); }} className="space-y-3">
                      {form.tipo === "corrente" && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div><Label>Banco *</Label><Input required value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                            <div><Label>Agência (sem dígito) *</Label><Input required value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></div>
                            <div><Label>Conta (com dígito) *</Label><Input required value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} onBlur={(e) => setForm({ ...form, conta: formatContaComDigito(e.target.value) })} placeholder="Ex: 12345-6" /></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label>Nome da conta *</Label>
                              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                              <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                            </div>
                            <div>
                              <Label>Modalidade da conta *</Label>
                              <RadioGroup value={form.modalidade} onValueChange={(v) => setForm({ ...form, modalidade: v })} className="flex gap-4 pt-2">
                                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pj" /> Conta empresarial (PJ)</label>
                                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pf" /> Conta pessoal (PF)</label>
                              </RadioGroup>
                            </div>
                          </div>
                          {/* saldo movido para o passo 3 */}
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={form.padrao} onCheckedChange={(v) => setForm({ ...form, padrao: !!v })} />
                            Use esta conta como padrão ao criar receitas e despesas.
                          </label>
                        </>
                      )}

                      {(form.tipo === "caixa" || form.tipo === "outras") && (
                        <>
                          <div>
                            <Label>Nome da conta *</Label>
                            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                            <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                          </div>
                          {/* saldo movido para o passo 3 */}
                        </>
                      )}

                      {form.tipo === "cartao_credito" && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <Label>Nome do cartão *</Label>
                              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                              <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar este cartão depois</p>
                            </div>
                            <div><Label>Últimos 4 números *</Label><Input required maxLength={4} value={form.cartao_ultimos4} onChange={(e) => setForm({ ...form, cartao_ultimos4: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
                            <div>
                              <Label>Bandeira do cartão *</Label>
                              <Select value={form.cartao_bandeira} onValueChange={(v) => setForm({ ...form, cartao_bandeira: v })}>
                                <SelectTrigger><SelectValue placeholder="Selecione a bandeira" /></SelectTrigger>
                                <SelectContent>
                                  {["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"].map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Emissor do cartão *</Label>
                              <Input required value={form.cartao_emissor} onChange={(e) => setForm({ ...form, cartao_emissor: e.target.value })} placeholder="Ex: Bradesco" />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label>Conta padrão para pagamento *</Label>
                              <Select value={form.cartao_conta_pagamento_id} onValueChange={(v) => setForm({ ...form, cartao_conta_pagamento_id: v })}>
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {contasCorrentes.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome ?? c.banco}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div><Label>Dia do fechamento *</Label><Input required type="number" min={1} max={31} value={form.cartao_dia_fechamento} onChange={(e) => setForm({ ...form, cartao_dia_fechamento: e.target.value })} /></div>
                            <div><Label>Dia do vencimento *</Label><Input required type="number" min={1} max={31} value={form.cartao_dia_vencimento} onChange={(e) => setForm({ ...form, cartao_dia_vencimento: e.target.value })} /></div>
                          </div>
                        </>
                      )}

                      {(form.tipo === "investimento" || form.tipo === "aplicacao_automatica") && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label>Nome da conta {form.tipo === "investimento" ? "investimento" : "aplicação"} *</Label>
                            <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                            <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                          </div>
                          <div><Label>Banco *</Label><Input required value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                          <div>
                            <Label>Conta corrente vinculada *</Label>
                            <Select value={form.conta_vinculada_id} onValueChange={(v) => setForm({ ...form, conta_vinculada_id: v })}>
                              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                {contasCorrentes.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome ?? c.banco}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {form.tipo === "poupanca" && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label>Nome da conta poupança *</Label>
                              <Input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                              <p className="text-xs text-muted-foreground mt-1">Dê um nome para identificar esta conta depois</p>
                            </div>
                            <div><Label>Banco *</Label><Input required value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></div>
                            <div>
                              <Label>Conta corrente vinculada *</Label>
                              <Select value={form.conta_vinculada_id} onValueChange={(v) => setForm({ ...form, conta_vinculada_id: v })}>
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {contasCorrentes.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome ?? c.banco}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <Label>Modalidade da conta *</Label>
                            <RadioGroup value={form.modalidade} onValueChange={(v) => setForm({ ...form, modalidade: v })} className="flex gap-4 pt-2">
                              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pj" /> Conta empresarial (PJ)</label>
                              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pf" /> Conta pessoal (PF)</label>
                            </RadioGroup>
                          </div>
                        </>
                      )}

                      <div>
                        <Button type="submit" disabled={!podeContinuarStep2()}>Continuar</Button>
                      </div>
                    </form>
                  </Card>
                )}

                {/* Step 3 - saldo */}
                {step === 3 && (
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold">3</div>
                      <h3 className="font-semibold text-sm">Informe o saldo *</h3>
                      <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setStep(2)}>Editar dados</Button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); if (form.data_inicio_lancamentos && form.saldo_dia_anterior !== "") criar.mutate(form); }} className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Início dos lançamentos *</Label>
                          <Input required type="date" value={form.data_inicio_lancamentos} onChange={(e) => setForm({ ...form, data_inicio_lancamentos: e.target.value })} />
                          <p className="text-xs text-muted-foreground mt-1">Informe uma data até hoje</p>
                        </div>
                        <div>
                          <Label>Saldo final da conta no dia anterior *</Label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                            <Input
                              required
                              type="text"
                              inputMode="numeric"
                              className="pl-9"
                              value={(() => {
                                const raw = form.saldo_dia_anterior;
                                if (raw === "" || raw === "-") return raw;
                                const n = Number(raw);
                                if (isNaN(n)) return "";
                                return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                              })()}
                              onKeyDown={(e) => {
                                if (e.key === "-") {
                                  e.preventDefault();
                                  const v = form.saldo_dia_anterior;
                                  if (v === "" || v === "0") setForm({ ...form, saldo_dia_anterior: "-" });
                                  else if (v === "-") setForm({ ...form, saldo_dia_anterior: "" });
                                  else setForm({ ...form, saldo_dia_anterior: v.startsWith("-") ? v.slice(1) : `-${v}` });
                                }
                              }}
                              onChange={(e) => {
                                const negative = form.saldo_dia_anterior.startsWith("-");
                                const digits = e.target.value.replace(/\D/g, "");
                                if (!digits) { setForm({ ...form, saldo_dia_anterior: negative ? "-" : "" }); return; }
                                const val = (Number(digits) / 100).toFixed(2);
                                setForm({ ...form, saldo_dia_anterior: negative ? `-${val}` : val });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => { setOpen(false); resetWizard(); }}>Cancelar</Button>
                        <Button type="submit" disabled={criar.isPending || !form.data_inicio_lancamentos || form.saldo_dia_anterior === ""}>
                          {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
                        </Button>
                      </DialogFooter>
                  </Card>
                )}
              </DialogContent>
            </Dialog>
          </div>
        }
      />
              </DialogContent>
            </Dialog>
          </div>
        }
      />
      {!contas?.length ? (
        <EmptyState icon={Banknote} title="Sem contas financeiras" description="Cadastre suas contas para acompanhar saldos e realizar conciliação." />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Ag/Conta</TableHead>
              <TableHead className="text-right">Saldo atual</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {contas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const b = detectBancoByNome(c.banco);
                        return b ? (
                          <img src={b.logo} alt={b.nome} className="h-6 w-6 rounded object-contain bg-white ring-1 ring-border shrink-0" />
                        ) : (
                          <div className="h-6 w-6 rounded bg-muted grid place-items-center shrink-0"><Banknote className="h-3 w-3 text-muted-foreground" /></div>
                        );
                      })()}
                      <span>{c.nome ?? c.banco ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{TIPO_LABEL[c.tipo]}</Badge></TableCell>
                  <TableCell className="text-tabular">{c.agencia ?? "—"}/{c.conta ?? "—"}</TableCell>
                  <TableCell className="text-right text-tabular font-medium">{brl(c.saldo_atual)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      disabled={excluir.isPending}
                      onClick={() => {
                        if (window.confirm(`Excluir a conta "${c.nome ?? c.banco}"? Extratos importados serão apagados e lançamentos vinculados ficarão sem conta.`)) {
                          excluir.mutate(c.id);
                        }
                      }}>
                      <Trash2 className="mr-1 h-3 w-3" />Excluir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ReconcileDialog
        contaId={reconcilingId}
        conta={contas?.find((c) => c.id === reconcilingId) ?? null}
        empresaId={empresa?.id ?? null}
        autoConciliar={autoConciliar}
        importing={reconcilingId ? importing === reconcilingId : false}
        onImport={() => reconcilingId && triggerUpload(reconcilingId)}
        onClose={() => setReconcilingId(null)}
      />
    </>
  );
}

function TipoCard({ t, selected, onSelect }: { t: { value: TipoConta; label: string; desc: string; icon: typeof Landmark }; selected: boolean; onSelect: () => void }) {
  const Icon = t.icon;
  return (
    <button type="button" onClick={onSelect}
      className={cn("text-left rounded-lg border p-3 transition hover:border-primary/60",
        selected ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center",
            selected ? "border-primary" : "border-muted-foreground")}>
            {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <span className="font-medium text-sm">{t.label}</span>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xs text-muted-foreground mt-2 leading-snug">{t.desc}</p>
    </button>
  );
}

type RowState = {
  descricao: string;
  categoria_id: string;
  contato_id: string;
  centro_custo_id: string;
  lancamento_id: string;
};

const PAGE_SIZE = 10;

const emptyRow = (memo: string | null): RowState => ({
  descricao: memo ?? "", categoria_id: "", contato_id: "", centro_custo_id: "", lancamento_id: "",
});

function ReconcileDialog({ contaId, conta, empresaId, autoConciliar, importing, onImport, onClose }: { contaId: string | null; conta: ContaBancaria | null; empresaId: string | null; autoConciliar: boolean; importing: boolean; onImport: () => void; onClose: () => void }) {
  const autoRunRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
  const open = !!contaId;

  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "recebimentos" | "pagamentos">("todos");
  const [ordem, setOrdem] = useState<"recentes" | "antigos" | "maior" | "menor">("recentes");
  const [mes, setMes] = useState("todos");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => setBuscaDebounced(busca), 250);
    return () => clearTimeout(id);
  }, [busca]);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [buscarModo, setBuscarModo] = useState<Record<string, boolean>>({});

  useEffect(() => { if (!open) { setBusca(""); setFiltro("todos"); setSel(new Set()); setRows({}); setBuscarModo({}); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data: txs, isLoading } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["ofx", contaId] as const,
    queryFn: async (): Promise<OfxRow[]> => {
      const { data, error } = await supabase.from("ofx_transacoes")
        .select("id,data_transacao,valor,tipo,memo,status,lancamento_id")
        .eq("conta_bancaria_id", contaId!).order("data_transacao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lancamentosAbertos } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["lanc-abertos", empresaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos_financeiros")
        .select("id,descricao,valor,tipo,data_vencimento")
        .eq("empresa_id", empresaId!).in("status", ["aberto", "vencido", "parcial"])
        .order("data_vencimento").limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categorias } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["categorias-conc", empresaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias_financeiras")
        .select("id,nome,tipo").eq("empresa_id", empresaId!).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contatos } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["contatos-conc", empresaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("contatos")
        .select("id,nome").eq("empresa_id", empresaId!).eq("ativo", true).order("nome").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: centros } = useQuery({
    enabled: open && !!empresaId,
    queryKey: ["centros-conc", empresaId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("centros_custo")
        .select("id,nome").eq("empresa_id", empresaId!).eq("ativo", true).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const conciliar = useMutation({
    mutationFn: async ({ ofxId, lancamentoId, valor }: { ofxId: string; lancamentoId: string; valor: number }) => {
      const { error: e1 } = await supabase.from("lancamentos_financeiros")
        .update({ status: "pago", valor_pago: Math.abs(valor), data_pagamento: format(new Date(), "yyyy-MM-dd"), conta_bancaria_id: contaId })
        .eq("id", lancamentoId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: lancamentoId }).eq("id", ofxId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Transação conciliada");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoRunningRef = useRef(false);
  useEffect(() => {
    if (!autoConciliar || !txs || !lancamentosAbertos || autoRunningRef.current) return;
    const pares: { ofxId: string; lancamentoId: string; valor: number }[] = [];
    const usados = new Set<string>();
    for (const tx of txs) {
      if (tx.status === "conciliada" || autoRunRef.current.has(tx.id)) continue;
      const match = lancamentosAbertos.find((l) =>
        !usados.has(l.id) &&
        Math.abs(Number(l.valor) - Math.abs(tx.valor)) < 0.01 &&
        l.data_vencimento === tx.data_transacao
      );
      if (match) {
        usados.add(match.id);
        autoRunRef.current.add(tx.id);
        pares.push({ ofxId: tx.id, lancamentoId: match.id, valor: tx.valor });
      }
    }
    if (!pares.length) return;
    autoRunningRef.current = true;
    (async () => {
      const hoje = format(new Date(), "yyyy-MM-dd");
      let ok = 0;
      for (const p of pares) {
        const { error: e1 } = await supabase.from("lancamentos_financeiros")
          .update({ status: "pago", valor_pago: Math.abs(p.valor), data_pagamento: hoje, conta_bancaria_id: contaId })
          .eq("id", p.lancamentoId);
        if (e1) continue;
        const { error: e2 } = await supabase.from("ofx_transacoes")
          .update({ status: "conciliada", lancamento_id: p.lancamentoId }).eq("id", p.ofxId);
        if (!e2) ok++;
      }
      if (ok > 0) toast.success(`${ok} lançamento(s) conciliado(s) automaticamente`);
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      autoRunningRef.current = false;
    })();
  }, [autoConciliar, txs, lancamentosAbertos, contaId, empresaId, qc]);

  const criarEConciliar = useMutation({
    mutationFn: async ({ tx, r }: { tx: OfxRow; r: RowState }) => {
      if (!empresaId || !contaId) throw new Error("Empresa não selecionada");
      if (r.lancamento_id) {
        const { error: e1 } = await supabase.from("lancamentos_financeiros")
          .update({ status: "pago", valor_pago: Math.abs(tx.valor), data_pagamento: tx.data_transacao, conta_bancaria_id: contaId })
          .eq("id", r.lancamento_id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("ofx_transacoes")
          .update({ status: "conciliada", lancamento_id: r.lancamento_id }).eq("id", tx.id);
        if (e2) throw e2;
        return;
      }
      if (!r.descricao.trim()) throw new Error("Informe a descrição");
      if (!r.categoria_id) throw new Error("Selecione a categoria");
      const tipo = tx.valor >= 0 ? "receber" : "pagar";
      const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
        empresa_id: empresaId, tipo, descricao: r.descricao.trim(),
        valor: Math.abs(tx.valor), valor_pago: Math.abs(tx.valor),
        data_emissao: tx.data_transacao, data_vencimento: tx.data_transacao,
        data_pagamento: tx.data_transacao, status: "pago", conta_bancaria_id: contaId,
        categoria_id: r.categoria_id || null,
        contato_id: r.contato_id || null,
        centro_custo_id: r.centro_custo_id || null,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: lanc.id }).eq("id", tx.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Lançamento conciliado");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirTx = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("ofx_transacoes")
        .delete().in("id", ids).neq("status", "conciliada");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento(s) excluído(s) do extrato");
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const excluirExtrato = useMutation({
    mutationFn: async () => {
      if (!contaId) throw new Error("Conta não selecionada");
      const { data: vinculos, error: eSel } = await supabase.from("ofx_transacoes")
        .select("lancamento_id").eq("conta_bancaria_id", contaId).not("lancamento_id", "is", null);
      if (eSel) throw eSel;
      const lancIds = Array.from(new Set((vinculos ?? []).map((v) => v.lancamento_id).filter(Boolean) as string[]));
      const { error: eDel } = await supabase.from("ofx_transacoes").delete().eq("conta_bancaria_id", contaId);
      if (eDel) throw eDel;
      if (lancIds.length) {
        const { error: eLanc } = await supabase.from("lancamentos_financeiros").delete().in("id", lancIds);
        if (eLanc) throw eLanc;
      }
      return { txs: (vinculos?.length ?? 0), lancs: lancIds.length };
    },
    onSuccess: (r) => {
      toast.success(`Extrato removido — ${r.lancs} lançamento(s) excluído(s)`);
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
      qc.invalidateQueries({ queryKey: ["lanc-abertos", empresaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendentes = useMemo(
    () => (txs ?? []).filter((t) => t.status !== "conciliada" && t.status !== "arquivada"),
    [txs],
  );

  const mesesDisponiveis = useMemo(
    () => Array.from(new Set(pendentes.map((t) => (t.data_transacao ?? "").slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [pendentes],
  );
  const labelMes = (m: string) => {
    const [y, mm] = m.split("-");
    const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const n = nomes[Number(mm) - 1] ?? mm;
    return `${n.charAt(0).toUpperCase()}${n.slice(1)}/${y}`;
  };

  const porMes = useMemo(
    () => pendentes.filter((t) => mes === "todos" || (t.data_transacao ?? "").slice(0, 7) === mes),
    [pendentes, mes],
  );

  const recebimentos = useMemo(() => porMes.filter((t) => t.valor >= 0).length, [porMes]);
  const pagamentos = porMes.length - recebimentos;

  const q = buscaDebounced.trim().toLowerCase();
  const visiveis = useMemo(() => {
    return porMes
      .filter((t) => filtro === "todos" || (filtro === "recebimentos" ? t.valor >= 0 : t.valor < 0))
      .filter((t) => !q || (t.memo ?? "").toLowerCase().includes(q) || String(t.valor).includes(q.replace(",", ".")))
      .sort((a, b) => {
        if (ordem === "recentes") return b.data_transacao.localeCompare(a.data_transacao);
        if (ordem === "antigos") return a.data_transacao.localeCompare(b.data_transacao);
        if (ordem === "maior") return Math.abs(b.valor) - Math.abs(a.valor);
        return Math.abs(a.valor) - Math.abs(b.valor);
      });
  }, [porMes, filtro, q, ordem]);

  // Paginação: renderizar centenas de cards de uma vez trava a tela.
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  useEffect(() => { setPagina(1); }, [q, filtro, ordem, mes, contaId]);
  const daPagina = useMemo(
    () => visiveis.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE),
    [visiveis, paginaAtual],
  );

  const catsReceber = useMemo(() => (categorias ?? []).filter((c) => c.tipo === "receber"), [categorias]);
  const catsPagar = useMemo(() => (categorias ?? []).filter((c) => c.tipo === "pagar"), [categorias]);

  const getRow = useCallback(
    (tx: OfxRow) => rows[tx.id] ?? emptyRow(tx.memo),
    [rows],
  );
  const setRow = useCallback((id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyRow(null)), ...patch } })), []);

  const toggleSel = useCallback((id: string) =>
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);

  const setModoBusca = useCallback((id: string, v: boolean) => {
    setBuscarModo((p) => ({ ...p, [id]: v }));
    if (!v) setRow(id, { lancamento_id: "" });
  }, [setRow]);

  const conciliarSelecionados = async () => {
    const alvos = visiveis.filter((t) => sel.has(t.id));
    if (!alvos.length) { toast.error("Selecione ao menos um lançamento"); return; }
    for (const tx of alvos) await criarEConciliar.mutateAsync({ tx, r: getRow(tx) }).catch(() => null);
    setSel(new Set());
  };


  const titulo = conta ? `Contas financeiras — ${conta.nome ?? conta.banco ?? ""}` : "Conciliação bancária";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        <div className="flex items-center gap-2">
          {conta?.tipo === "corrente" && (
            <Button variant="default" size="sm" disabled={importing} onClick={onImport}>
              {importing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
              Importar OFX
            </Button>
          )}
          {txs && txs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={excluirExtrato.isPending}
              onClick={() => {
                if (window.confirm("Excluir todo o extrato OFX importado desta conta?\n\nSerão apagados TODOS os lançamentos criados/conciliados a partir dele, mesmo os já conciliados. Esta ação não pode ser desfeita.")) {
                  excluirExtrato.mutate();
                }
              }}
            >
              {excluirExtrato.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />}
              Excluir extrato importado
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">


        <div className="w-full">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            Conciliações pendentes
            <Badge variant="secondary">{pendentes.length}</Badge>
          </div>

        <div className="mt-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Pesquise o lançamento bancário</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Descrição ou valor" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os meses</SelectItem>
                    {mesesDisponiveis.map((m) => (
                      <SelectItem key={m} value={m}>{labelMes(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setFiltro("todos"); setMes("todos"); }}>
                  <Trash2 className="mr-1 h-3 w-3" />Limpar filtros
                </Button>

              </div>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-md border">
              {([
                { k: "todos", label: "Todos", n: porMes.length, cls: "text-primary" },
                { k: "recebimentos", label: "Recebimentos", n: recebimentos, cls: "text-success" },
                { k: "pagamentos", label: "Pagamentos", n: pagamentos, cls: "text-destructive" },
              ] as const).map((c) => (
                <button
                  key={c.k}
                  type="button"
                  onClick={() => setFiltro(c.k)}
                  className={cn(
                    "border-r px-4 py-3 text-center last:border-r-0 transition-colors hover:bg-muted/50",
                    filtro === c.k && "border-t-2 border-t-primary bg-muted/40"
                  )}
                >
                  <div className="text-sm text-muted-foreground">{c.label}</div>
                  <div className={cn("text-lg font-semibold", c.cls)}>{c.n}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm"
                onClick={() => setSel(sel.size === visiveis.length ? new Set() : new Set(visiveis.map((t) => t.id)))}>
                {sel.size === visiveis.length && visiveis.length > 0 ? "Limpar seleção" : "Selecionar lançamentos"}
              </Button>
              <Button variant="outline" size="sm" disabled={!sel.size || criarEConciliar.isPending} onClick={conciliarSelecionados}>
                {criarEConciliar.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Conciliar
              </Button>
              <Button variant="outline" size="sm" disabled={!sel.size || excluirTx.isPending}
                onClick={() => excluirTx.mutate(Array.from(sel))}>
                <Trash2 className="mr-1 h-3 w-3" />Excluir
              </Button>

              <div className="ml-auto">
                <Select value={ordem} onValueChange={(v) => setOrdem(v as typeof ordem)}>
                  <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recentes">Mais recentes</SelectItem>
                    <SelectItem value="antigos">Mais antigos</SelectItem>
                    <SelectItem value="maior">Maior valor</SelectItem>
                    <SelectItem value="menor">Menor valor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm font-medium md:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center gap-2"><span className="rounded bg-destructive px-1.5 text-xs text-destructive-foreground">B</span>Lançamentos do banco</div>
              <div />
              <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" />Lançamentos do sistema</div>
            </div>

            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : !txs?.length ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma transação importada. Use "Importar OFX" para começar.
              </div>
            ) : !visiveis.length ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Tudo conciliado. 🎉</div>
            ) : (
              <div className="space-y-4">
                {daPagina.map((tx) => (
                  <ReconcileRow
                    key={tx.id}
                    tx={tx}
                    r={getRow(tx)}
                    modoBusca={!!buscarModo[tx.id]}
                    selected={sel.has(tx.id)}
                    categorias={tx.valor >= 0 ? catsReceber : catsPagar}
                    contatos={contatos ?? EMPTY}
                    centros={centros ?? EMPTY}
                    lancamentosAbertos={lancamentosAbertos ?? EMPTY_LANC}
                    conciliando={criarEConciliar.isPending}
                    excluindo={excluirTx.isPending}
                    onToggleSel={toggleSel}
                    onSetRow={setRow}
                    onSetModoBusca={setModoBusca}
                    onConciliar={(t, r) => criarEConciliar.mutate({ tx: t, r })}
                    onExcluir={(id) => excluirTx.mutate([id])}
                  />
                ))}

                {totalPaginas > 1 && (
                  <div className="flex items-center justify-center gap-3 py-4 text-sm">
                    <Button variant="outline" size="sm" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>
                      Anterior
                    </Button>
                    <span className="text-muted-foreground">
                      Página {paginaAtual} de {totalPaginas} — {visiveis.length} lançamentos
                    </span>
                    <Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>
                      Próxima
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY: { id: string; nome: string }[] = [];
const EMPTY_LANC: { id: string; descricao: string; valor: number; tipo: string; data_vencimento: string }[] = [];

type Opcao = { id: string; nome: string };

const ReconcileRow = memo(function ReconcileRow({
  tx, r, modoBusca, selected, categorias, contatos, centros, lancamentosAbertos,
  conciliando, excluindo, onToggleSel, onSetRow, onSetModoBusca, onConciliar, onExcluir,
}: {
  tx: OfxRow;
  r: RowState;
  modoBusca: boolean;
  selected: boolean;
  categorias: Opcao[];
  contatos: Opcao[];
  centros: Opcao[];
  lancamentosAbertos: { id: string; descricao: string; valor: number; data_vencimento: string }[];
  conciliando: boolean;
  excluindo: boolean;
  onToggleSel: (id: string) => void;
  onSetRow: (id: string, patch: Partial<RowState>) => void;
  onSetModoBusca: (id: string, v: boolean) => void;
  onConciliar: (tx: OfxRow, r: RowState) => void;
  onExcluir: (id: string) => void;
}) {
  const data = new Date(tx.data_transacao + "T00:00:00");
  const nomeContato = r.contato_id ? (contatos.find((c) => c.id === r.contato_id)?.nome ?? "—") : "Informação não recebida";

  return (
    <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
      {/* banco */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Checkbox checked={selected} onCheckedChange={() => onToggleSel(tx.id)} />
            <span className="text-sm font-semibold">{format(data, "dd/MM/yyyy")}</span>
            <span className="text-xs text-muted-foreground capitalize">{format(data, "EEEE")}</span>
          </div>
          <span className={cn("text-tabular font-semibold", tx.valor < 0 ? "text-destructive" : "text-success")}>
            {brl(tx.valor)}
          </span>
        </div>
        <div className="space-y-1 px-4 py-3 text-sm">
          <div className="font-medium">{tx.memo ?? "—"}</div>
          <div className="text-muted-foreground"><span className="font-medium text-foreground">Cliente:</span> {nomeContato}</div>
          <div className="text-muted-foreground"><span className="font-medium text-foreground">CPF/CNPJ:</span> Informação não recebida</div>
        </div>
        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
          <Badge variant="secondary" className="text-xs">Integração manual</Badge>
          <Button variant="outline" size="sm" onClick={() => onExcluir(tx.id)} disabled={excluindo}>
            <Trash2 className="mr-1 h-3 w-3" />Excluir
          </Button>
        </div>
      </Card>

      <div className="flex justify-center">
        <Button disabled={conciliando} onClick={() => onConciliar(tx, r)}>
          {conciliando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
          Conciliar
        </Button>
      </div>

      {/* sistema */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex gap-1">
            <Button size="sm" variant={modoBusca ? "outline" : "default"} onClick={() => onSetModoBusca(tx.id, false)}>
              Novo lançamento
            </Button>
            <Button size="sm" variant={modoBusca ? "default" : "outline"} onClick={() => onSetModoBusca(tx.id, true)}>
              <Search className="mr-1 h-3 w-3" />Buscar lançamento
            </Button>
          </div>
        </div>
        <div className="px-4 py-3">
          {modoBusca ? (
            <div className="space-y-1">
              <Label className="text-xs">Lançamento existente</Label>
              <LancamentoPicker
                valorRef={Math.abs(tx.valor)}
                lancamentos={lancamentosAbertos}
                value={r.lancamento_id}
                onChange={(v) => onSetRow(tx.id, { lancamento_id: v })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Descrição <span className="text-destructive">*</span></Label>
                <Input value={r.descricao} onChange={(e) => onSetRow(tx.id, { descricao: e.target.value })} placeholder="Descrição" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria <span className="text-destructive">*</span></Label>
                <Select value={r.categoria_id} onValueChange={(v) => onSetRow(tx.id, { categoria_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tx.valor >= 0 ? "Cliente" : "Fornecedor"}</Label>
                <Select value={r.contato_id} onValueChange={(v) => onSetRow(tx.id, { contato_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {contatos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Centro de custo</Label>
                <Select value={r.centro_custo_id} onValueChange={(v) => onSetRow(tx.id, { centro_custo_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {centros.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
});



type LancOpt = { id: string; descricao: string; valor: number; data_vencimento: string };

function LancamentoPicker({ valorRef, lancamentos, value, onChange }: {
  valorRef: number;
  lancamentos: LancOpt[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selecionado = value ? lancamentos.find((l) => l.id === value) : undefined;

  const lista = useMemo(() => {
    const termo = q.trim().toLowerCase();
    const digitos = termo.replace(/[^\d]/g, "");
    const base = lancamentos.filter((l) => {
      if (!termo) return true;
      const valorTxt = Number(l.valor).toFixed(2);
      const valorBr = brl(Number(l.valor)).toLowerCase();
      const dataTxt = format(new Date(l.data_vencimento + "T00:00:00"), "dd/MM/yyyy");
      return (
        (l.descricao ?? "").toLowerCase().includes(termo) ||
        valorTxt.includes(termo) ||
        valorBr.includes(termo) ||
        dataTxt.includes(termo) ||
        (digitos.length >= 2 && valorTxt.replace(".", "").includes(digitos))
      );
    });
    return base
      .slice()
      .sort((a, b) => Math.abs(Number(a.valor) - valorRef) - Math.abs(Number(b.valor) - valorRef))
      .slice(0, 80);
  }, [lancamentos, q, valorRef]);

  const label = selecionado
    ? `${format(new Date(selecionado.data_vencimento + "T00:00:00"), "dd/MM")} — ${selecionado.descricao} (${brl(Number(selecionado.valor))})`
    : "Pesquise por valor, descrição ou data";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className={cn("truncate", !selecionado && "text-muted-foreground")}>{label}</span>
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Digite valor, nome ou descrição..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhum lançamento encontrado.</CommandEmpty>
            <CommandGroup>
              {lista.map((l) => (
                <CommandItem
                  key={l.id}
                  value={l.id}
                  onSelect={() => { onChange(l.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === l.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    {format(new Date(l.data_vencimento + "T00:00:00"), "dd/MM")} — {l.descricao}
                  </span>
                  <span className="ml-auto pl-2 text-tabular text-xs text-muted-foreground">{brl(Number(l.valor))}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
