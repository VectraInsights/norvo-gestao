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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Banknote, Plus, Upload, Loader2, Link2, Check, Landmark, Wallet, CreditCard, TrendingUp, PiggyBank, DollarSign, Database, Coins, Trash2, Search, Archive } from "lucide-react";
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
        conta={contas?.find((c) => c.id === reconcilingId) ?? null}
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

type RowState = {
  descricao: string;
  categoria_id: string;
  contato_id: string;
  centro_custo_id: string;
  lancamento_id: string;
};

const emptyRow = (memo: string | null): RowState => ({
  descricao: memo ?? "", categoria_id: "", contato_id: "", centro_custo_id: "", lancamento_id: "",
});

function ReconcileDialog({ contaId, conta, empresaId, autoConciliar, onClose }: { contaId: string | null; conta: ContaBancaria | null; empresaId: string | null; autoConciliar: boolean; onClose: () => void }) {
  const autoRunRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();
  const open = !!contaId;

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "recebimentos" | "pagamentos">("todos");
  const [ordem, setOrdem] = useState<"recentes" | "antigos" | "maior" | "menor">("recentes");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [buscarModo, setBuscarModo] = useState<Record<string, boolean>>({});

  useEffect(() => { if (!open) { setBusca(""); setFiltro("todos"); setSel(new Set()); setRows({}); setBuscarModo({}); } }, [open]);

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

  const arquivar = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("ofx_transacoes").update({ status: "arquivada" }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento(s) arquivado(s)");
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

  const pendentes = (txs ?? []).filter((t) => t.status !== "conciliada" && t.status !== "arquivada");
  const conciliadas = (txs ?? []).filter((t) => t.status === "conciliada");
  const recebimentos = pendentes.filter((t) => t.valor >= 0).length;
  const pagamentos = pendentes.length - recebimentos;

  const q = busca.trim().toLowerCase();
  const visiveis = pendentes
    .filter((t) => filtro === "todos" || (filtro === "recebimentos" ? t.valor >= 0 : t.valor < 0))
    .filter((t) => !q || (t.memo ?? "").toLowerCase().includes(q) || String(t.valor).includes(q.replace(",", ".")))
    .sort((a, b) => {
      if (ordem === "recentes") return b.data_transacao.localeCompare(a.data_transacao);
      if (ordem === "antigos") return a.data_transacao.localeCompare(b.data_transacao);
      if (ordem === "maior") return Math.abs(b.valor) - Math.abs(a.valor);
      return Math.abs(a.valor) - Math.abs(b.valor);
    });

  const getRow = (tx: OfxRow) => rows[tx.id] ?? emptyRow(tx.memo);
  const setRow = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyRow(null)), ...patch } }));

  const toggleSel = (id: string) =>
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const conciliarSelecionados = async () => {
    const alvos = visiveis.filter((t) => sel.has(t.id));
    if (!alvos.length) { toast.error("Selecione ao menos um lançamento"); return; }
    for (const tx of alvos) await criarEConciliar.mutateAsync({ tx, r: getRow(tx) }).catch(() => null);
    setSel(new Set());
  };

  const titulo = conta ? `Contas financeiras — ${conta.nome ?? conta.banco ?? ""}` : "Conciliação bancária";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[1200px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-xl">{titulo}</DialogTitle>
            {txs && txs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mr-6 text-destructive hover:text-destructive"
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
          </div>
        </DialogHeader>

        <Tabs defaultValue="pendentes" className="w-full">
          <TabsList>
            <TabsTrigger value="pendentes">
              Conciliações pendentes
              <Badge variant="secondary" className="ml-2">{pendentes.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          </TabsList>

          <TabsContent value="pendentes" className="mt-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Pesquise o lançamento bancário</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Descrição ou valor" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setFiltro("todos"); }}>
                  <Trash2 className="mr-1 h-3 w-3" />Limpar filtros
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-md border">
              {([
                { k: "todos", label: "Todos", n: pendentes.length, cls: "text-primary" },
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
              <Button variant="outline" size="sm" disabled={!sel.size || arquivar.isPending}
                onClick={() => arquivar.mutate(Array.from(sel))}>
                <Archive className="mr-1 h-3 w-3" />Arquivar
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
                {visiveis.map((tx) => {
                  const r = getRow(tx);
                  const modoBusca = !!buscarModo[tx.id];
                  return (
                    <div key={tx.id} className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                      {/* banco */}
                      <Card className="overflow-hidden">
                        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Checkbox checked={sel.has(tx.id)} onCheckedChange={() => toggleSel(tx.id)} />
                            <span className="text-sm font-semibold">{format(new Date(tx.data_transacao + "T00:00:00"), "dd/MM/yyyy")}</span>
                            <span className="text-xs text-muted-foreground capitalize">
                              {format(new Date(tx.data_transacao + "T00:00:00"), "EEEE")}
                            </span>
                          </div>
                          <span className={cn("text-tabular font-semibold", tx.valor < 0 ? "text-destructive" : "text-success")}>
                            {brl(tx.valor)}
                          </span>
                        </div>
                        <div className="space-y-1 px-4 py-3 text-sm">
                          <div className="font-medium">{tx.memo ?? "—"}</div>
                          <div className="text-muted-foreground"><span className="font-medium text-foreground">Cliente:</span> {r.contato_id ? (contatos?.find((c) => c.id === r.contato_id)?.nome ?? "—") : "Informação não recebida"}</div>
                          <div className="text-muted-foreground"><span className="font-medium text-foreground">CPF/CNPJ:</span> Informação não recebida</div>
                        </div>
                        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
                          <Badge variant="secondary" className="text-xs">Integração manual</Badge>
                          <Button variant="outline" size="sm" onClick={() => arquivar.mutate([tx.id])} disabled={arquivar.isPending}>
                            <Archive className="mr-1 h-3 w-3" />Arquivar
                          </Button>
                        </div>
                      </Card>

                      <div className="flex justify-center">
                        <Button
                          disabled={criarEConciliar.isPending}
                          onClick={() => criarEConciliar.mutate({ tx, r })}
                        >
                          {criarEConciliar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                          Conciliar
                        </Button>
                      </div>

                      {/* sistema */}
                      <Card className="overflow-hidden">
                        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant={modoBusca ? "outline" : "default"}
                              onClick={() => { setBuscarModo((p) => ({ ...p, [tx.id]: false })); setRow(tx.id, { lancamento_id: "" }); }}>
                              Novo lançamento
                            </Button>
                            <Button size="sm" variant={modoBusca ? "default" : "outline"}
                              onClick={() => setBuscarModo((p) => ({ ...p, [tx.id]: true }))}>
                              <Search className="mr-1 h-3 w-3" />Buscar lançamento
                            </Button>
                          </div>
                        </div>
                        <div className="px-4 py-3">
                          {modoBusca ? (
                            <div className="space-y-1">
                              <Label className="text-xs">Lançamento existente</Label>
                              <Select value={r.lancamento_id} onValueChange={(v) => setRow(tx.id, { lancamento_id: v })}>
                                <SelectTrigger><SelectValue placeholder="Selecione um lançamento em aberto" /></SelectTrigger>
                                <SelectContent>
                                  {(lancamentosAbertos ?? [])
                                    .slice()
                                    .sort((a, b) => Math.abs(Number(a.valor) - Math.abs(tx.valor)) - Math.abs(Number(b.valor) - Math.abs(tx.valor)))
                                    .map((l) => (
                                      <SelectItem key={l.id} value={l.id}>
                                        {format(new Date(l.data_vencimento + "T00:00:00"), "dd/MM")} — {l.descricao} ({brl(Number(l.valor))})
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Descrição <span className="text-destructive">*</span></Label>
                                <Input value={r.descricao} onChange={(e) => setRow(tx.id, { descricao: e.target.value })} placeholder="Descrição" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Categoria <span className="text-destructive">*</span></Label>
                                <Select value={r.categoria_id} onValueChange={(v) => setRow(tx.id, { categoria_id: v })}>
                                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                  <SelectContent>
                                    {(categorias ?? [])
                                      .filter((c) => c.tipo === (tx.valor >= 0 ? "receber" : "pagar"))
                                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{tx.valor >= 0 ? "Cliente" : "Fornecedor"}</Label>
                                <Select value={r.contato_id} onValueChange={(v) => setRow(tx.id, { contato_id: v })}>
                                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                  <SelectContent>
                                    {(contatos ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Centro de custo</Label>
                                <Select value={r.centro_custo_id} onValueChange={(v) => setRow(tx.id, { centro_custo_id: v })}>
                                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                  <SelectContent>
                                    {(centros ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="movimentacoes" className="mt-4">
            <MovimentacoesConta contaId={contaId} empresaId={empresaId} saldoAtual={conta?.saldo_atual ?? 0} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
