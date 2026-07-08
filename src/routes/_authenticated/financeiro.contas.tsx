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
import { Banknote, Plus, Upload, Loader2, Link2, Check, Landmark, Wallet, CreditCard, TrendingUp, PiggyBank, DollarSign, Database, Coins, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { parseOfxFull } from "@/lib/ofx";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { detectBancoByNome, detectBancoByCodigo, formatContaComDigito, normalizaContaNumero } from "@/lib/bancos";

export const Route = createFileRoute("/_authenticated/financeiro/contas")({
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


function ContasFinanceiras() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tipo, setTipo] = useState<TipoConta>("corrente");
  const [form, setForm] = useState<FormState>(initialForm("corrente"));
  const [autoConciliar, setAutoConciliar] = useState(true);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
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
      <PageHeader eyebrow="Financeiro" title="Contas financeiras" description="Cadastro de contas, importação OFX e conciliação."
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={autoConciliar} onCheckedChange={(v) => setAutoConciliar(!!v)} />
              Conciliar automaticamente (mesmo valor e data)
            </label>
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
                    </form>
                  </Card>
                )}
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
                    {c.tipo === "corrente" && (
                      <Button variant="ghost" size="sm" disabled={importing === c.id} onClick={() => triggerUpload(c.id)}>
                        {importing === c.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                        Importar OFX
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setReconcilingId(c.id)}>
                      <Link2 className="mr-1 h-3 w-3" />Conciliar
                    </Button>
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
        empresaId={empresa?.id ?? null}
        autoConciliar={autoConciliar}
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

function ReconcileDialog({ contaId, empresaId, autoConciliar, onClose }: { contaId: string | null; empresaId: string | null; autoConciliar: boolean; onClose: () => void }) {
  const autoRunRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
  const open = !!contaId;

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


  const [novoTx, setNovoTx] = useState<OfxRow | null>(null);
  const [novaDescricao, setNovaDescricao] = useState("");

  const criarLanc = useMutation({
    mutationFn: async ({ tx, descricao }: { tx: OfxRow; descricao: string }) => {
      if (!empresaId || !contaId) throw new Error("Empresa não selecionada");
      const tipo = tx.valor >= 0 ? "receber" : "pagar";
      const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
        empresa_id: empresaId, tipo, descricao: descricao || tx.memo || "Importado OFX",
        valor: Math.abs(tx.valor), valor_pago: Math.abs(tx.valor),
        data_emissao: tx.data_transacao, data_vencimento: tx.data_transacao,
        data_pagamento: tx.data_transacao, status: "pago", conta_bancaria_id: contaId,
      }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("ofx_transacoes")
        .update({ status: "conciliada", lancamento_id: lanc.id }).eq("id", tx.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Lançamento criado e conciliado");
      setNovoTx(null); setNovaDescricao("");
      qc.invalidateQueries({ queryKey: ["ofx", contaId] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Conciliação bancária</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : !txs?.length ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma transação importada. Use "Importar OFX" para começar.
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Memo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vincular</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {txs.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-tabular whitespace-nowrap">
                    {format(new Date(tx.data_transacao), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-sm">{tx.memo ?? "—"}</TableCell>
                  <TableCell className={`text-right text-tabular ${tx.valor < 0 ? "text-destructive" : "text-success"}`}>
                    {brl(tx.valor)}
                  </TableCell>
                  <TableCell>
                    {tx.status === "conciliada" ? (
                      <Badge variant="secondary" className="bg-success/15 text-success"><Check className="mr-1 h-3 w-3" />Conciliada</Badge>
                    ) : (
                      <div className="flex gap-2">
                        <Select onValueChange={(v) => conciliar.mutate({ ofxId: tx.id, lancamentoId: v, valor: tx.valor })}>
                          <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Vincular lançamento" /></SelectTrigger>
                          <SelectContent>
                            {lancamentosAbertos?.filter((l) => Math.abs(Number(l.valor) - Math.abs(tx.valor)) < 0.01)
                              .concat(lancamentosAbertos?.filter((l) => Math.abs(Number(l.valor) - Math.abs(tx.valor)) >= 0.01) ?? [])
                              .map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {format(new Date(l.data_vencimento), "dd/MM")} — {l.descricao} ({brl(Number(l.valor))})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => { setNovoTx(tx); setNovaDescricao(tx.memo ?? ""); }}>
                          Novo
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      <Dialog open={!!novoTx} onOpenChange={(v) => { if (!v) { setNovoTx(null); setNovaDescricao(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo lançamento a partir do extrato</DialogTitle></DialogHeader>
          {novoTx && (
            <form onSubmit={(e) => { e.preventDefault(); criarLanc.mutate({ tx: novoTx, descricao: novaDescricao }); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div>Data: <span className="text-foreground">{format(new Date(novoTx.data_transacao), "dd/MM/yyyy")}</span></div>
                <div>Valor: <span className={novoTx.valor < 0 ? "text-destructive" : "text-success"}>{brl(novoTx.valor)}</span></div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input required autoFocus value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="Descrição do lançamento" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={criarLanc.isPending}>
                  {criarLanc.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar e conciliar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
