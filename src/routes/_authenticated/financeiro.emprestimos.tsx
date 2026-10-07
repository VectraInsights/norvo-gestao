import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/erp/money-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Plus, ChevronRight, Trash2, HandCoins, Search, Pencil, Check, X, FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { addMonths, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro/emprestimos")({
  component: EmprestimosPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm leading-relaxed text-destructive shadow-sm">
      Erro: {error instanceof Error ? error.message : "erro desconhecido"}
    </div>
  ),
});

type Emprestimo = {
  id: string; tipo: "emprestimo" | "financiamento"; descricao: string; credor: string | null;
  valor_principal: number; taxa_juros_mensal: number; parcelas: number;
  data_contratacao: string; primeiro_vencimento: string | null; status: string;
};
type Parcela = {
  id: string; emprestimo_id: string; numero: number; data_vencimento: string;
  valor: number; valor_juros: number; valor_amortizacao: number; status: string; lancamento_id: string | null;
};

/** Extrai o texto de todas as páginas de um PDF (pdfjs, padrão frota/RH). */
async function extrairTextoPdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import("pdfjs-dist");
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default || workerMod;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w2: any = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    pdfjsLib.GlobalWorkerOptions.workerSrc = w2.default || w2;
  }
  const pdf = await pdfjsLib.getDocument({ data: buf, verbosity: 0 }).promise;
  let texto = "";
  for (let pg = 1; pg <= pdf.numPages; pg++) {
    const page = await pdf.getPage(pg);
    const tc = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += (tc.items as any[]).map((it) => (typeof it?.str === "string" ? it.str : "")).join(" ") + "\n";
  }
  return texto;
}

type LinhaPdf = { numero: number; venc: string; valor: number };

/** Cronograma do anexo do banco: linhas "NNº DD/MM/AAAA R$ X.XXX,XX". */
function extrairCronograma(texto: string): LinhaPdf[] {
  const re = /(\d{1,3})\s*º\s*(\d{2})\/(\d{2})\/(\d{4})\s*R\$\s*([\d.,]+)/g;
  const achadas = new Map<number, LinhaPdf>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const numero = Number(m[1]);
    const bruto = String(m[5]).replace(/[^\d.,]/g, "");
    const norm = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
    const valor = Number(norm) || 0;
    if (!numero || !valor) continue;
    if (!achadas.has(numero))
      achadas.set(numero, { numero, venc: `${m[4]}-${m[3]}-${m[2]}`, valor });
  }
  return [...achadas.values()].sort((a, b) => a.numero - b.numero);
}

/** Cabeçalho da proposta: valor financiado, taxa a.m., nº parcelas, 1º venc, contratação. */
function extrairCabecalhoPdf(texto: string): { principal?: string; taxa?: string; primeiro?: string; contratacao?: string } {
  const out: { principal?: string; taxa?: string; primeiro?: string; contratacao?: string } = {};
  const br = (s: string) => s.replace(/\./g, "").replace(",", ".");
  let m: RegExpMatchArray | null;
  m = texto.match(/VALOR TOTAL FINANCIADO:?\s*([\d.,]+)/i);
  if (m && Number(br(m[1]))) out.principal = br(m[1]);
  m = texto.match(/([\d,]+)\s*%\s*a\.m\./i);
  if (m && Number(br(m[1]))) out.taxa = br(m[1]);
  m = texto.match(/(?:PRIMEIRA PARCELA[^0-9]*|1.? VENCIMENTO\s*)(\d{2})[./](\d{2})[./](\d{4})/i);
  if (m) out.primeiro = `${m[3]}-${m[2]}-${m[1]}`;
  m = texto.match(/DATA DA OPERAÇÃO:?\s*(\d{2})[./](\d{2})[./](\d{4})/i);
  if (m) out.contratacao = `${m[3]}-${m[2]}-${m[1]}`;
  return out;
}
function gerarPrice(principal: number, taxaPct: number, n: number, primeiro: Date) {
  const i = taxaPct / 100;
  const pmt = i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));
  let saldo = principal;
  return Array.from({ length: n }, (_, k) => {
    const juros = saldo * i;
    const amort = pmt - juros;
    saldo -= amort;
    return {
      numero: k + 1,
      data_vencimento: format(addMonths(primeiro, k), "yyyy-MM-dd"),
      valor: Number(pmt.toFixed(2)),
      valor_juros: Number(juros.toFixed(2)),
      valor_amortizacao: Number(amort.toFixed(2)),
    };
  });
}

function EmprestimosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const [tipo, setTipo] = useState<"emprestimo" | "financiamento">("emprestimo");
  const [descricao, setDescricao] = useState("");
  const [credor, setCredor] = useState("");
  const [principal, setPrincipal] = useState("0");
  const [taxa, setTaxa] = useState("0");
  const [parcelas, setParcelas] = useState("12");
  const [contratacao, setContratacao] = useState(format(new Date(), "yyyy-MM-dd"));
  const [primeiro, setPrimeiro] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [busca, setBusca] = useState("");
  // Edição manual de parcela (valor + vencimento): p/ contratos com carência,
  // balões ou parcelas irregulares que o Price não representa
  const [editParc, setEditParc] = useState<{ id: string; valor: string; venc: string } | null>(null);
  // PDF lido no "Novo contrato": preenche o formulário + cronograma p/ o cadastro
  const pdfNovoRef = useRef<HTMLInputElement | null>(null);
  const [pdfLendoNovo, setPdfLendoNovo] = useState(false);
  // Cronograma lido no "Novo contrato": ao cadastrar, usa ele em vez do Price
  const [pdfNovo, setPdfNovo] = useState<{ linhas: Array<{ numero: number; venc: string; valor: number }>; total: number } | null>(null);

  const { data: lista, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["emprestimos", empresa?.id],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      // Busca em páginas de 1000 para nunca cortar a lista (sem limite silencioso)
      const todas: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("emprestimos" as never)
          .select("id,tipo,descricao,credor,valor_principal,taxa_juros_mensal,parcelas,data_contratacao,primeiro_vencimento,status").eq("empresa_id", empresa!.id).order("data_contratacao", { ascending: false }).range(ini, ini + 999);
        if (error) throw error;
        todas.push(...(data ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todas as unknown as Emprestimo[];
    },
  });

  const { data: parcelasSel = [] } = useQuery({
    enabled: !!sel,
    queryKey: ["emprestimo-parcelas", sel],
    queryFn: async () => {
      // Parcelas de um único contrato: busca em páginas (sem limite silencioso)
      const todas: unknown[] = [];
      for (let ini = 0; ; ini += 1000) {
        const { data, error } = await supabase.from("emprestimo_parcelas" as never)
          .select("id,emprestimo_id,numero,data_vencimento,valor,valor_juros,valor_amortizacao,status,lancamento_id").eq("emprestimo_id", sel!).order("numero").range(ini, ini + 999);
        if (error) throw error;
        todas.push(...(data ?? []));
        if (!data || (data as unknown[]).length < 1000) break;
      }
      return todas as unknown as Parcela[];
    },
  });

  const previa = useMemo(() => {
    const p = Number(principal) || 0;
    const n = Number(parcelas) || 0;
    if (p <= 0 || n <= 0) return null;
    const linhas = gerarPrice(p, Number(taxa) || 0, n, new Date(`${primeiro}T00:00:00`));
    return { parcela: linhas[0]?.valor ?? 0, total: linhas.reduce((s, l) => s + l.valor, 0) };
  }, [principal, parcelas, taxa, primeiro]);

  const reset = () => {
    setTipo("emprestimo"); setDescricao(""); setCredor(""); setPrincipal("0");
    setTaxa("0"); setParcelas("12");
    setContratacao(format(new Date(), "yyyy-MM-dd"));
    setPrimeiro(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
    setPdfNovo(null);
  };

  const criar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      if (!descricao.trim()) throw new Error("Informe a descrição");
      const p = Number(principal) || 0;
      if (p <= 0) throw new Error("Informe o valor contratado");
      const comPdf = !!pdfNovo?.linhas.length;
      const n = comPdf ? pdfNovo!.linhas.length : Number(parcelas) || 0;
      if (n <= 0) throw new Error("Informe o número de parcelas");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: emp, error } = await (supabase.from("emprestimos" as never) as any).insert({
        empresa_id: empresa.id, tipo, descricao, credor: credor || null,
        valor_principal: p, taxa_juros_mensal: Number(taxa) || 0, parcelas: n,
        data_contratacao: contratacao, primeiro_vencimento: primeiro,
      }).select("id").single();
      if (error) throw error;

      // Com PDF: cronograma do banco; sem PDF: Price com parcelas iguais
      const linhas = comPdf
        ? pdfNovo!.linhas.map((l) => ({
            numero: l.numero, data_vencimento: l.venc, valor: l.valor,
            valor_juros: 0, valor_amortizacao: l.valor,
          }))
        : gerarPrice(p, Number(taxa) || 0, n, new Date(`${primeiro}T00:00:00`));
      const linhasIns = linhas.map((l) => ({ ...l, empresa_id: empresa.id, emprestimo_id: emp.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e2 } = await (supabase.from("emprestimo_parcelas" as never) as any).insert(linhasIns);
      if (e2) throw e2;
      return comPdf;
    },
    onSuccess: (comPdf) => {
      toast.success(comPdf ? "Contrato cadastrado com o cronograma do PDF" : "Contrato cadastrado — ajuste as parcelas se o banco usar valores diferentes");
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarParcela = useMutation({
    mutationFn: async () => {
      const alvo = parcelasSel.find((p) => p.id === editParc?.id);
      if (!alvo) throw new Error("Parcela não encontrada");
      if (alvo.lancamento_id) throw new Error("Parcela já lançada no Contas a pagar — não pode ser alterada");
      const v = Number(editParc?.valor) || 0;
      if (v <= 0) throw new Error("Informe o valor da parcela");
      if (!editParc?.venc) throw new Error("Informe o vencimento");
      await gravarParcela(alvo, v, editParc.venc);
    },
    onSuccess: () => {
      toast.success("Parcela atualizada");
      setEditParc(null);
      qc.invalidateQueries({ queryKey: ["emprestimo-parcelas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reparte juros/amortização proporcionalmente p/ a soma continuar fechando
  const gravarParcela = async (alvo: Parcela, v: number, venc: string) => {
    const oldV = Number(alvo.valor) || 0;
    let juros = 0;
    if (oldV > 0) juros = Number((((Number(alvo.valor_juros) || 0) * v) / oldV).toFixed(2));
    const amort = Number((v - juros).toFixed(2));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("emprestimo_parcelas" as never) as any)
      .update({ valor: v, data_vencimento: venc, valor_juros: juros, valor_amortizacao: amort })
      .eq("id", alvo.id);
    if (error) throw error;
  };

  // PDF antes do contrato: preenche o formulário + guarda o cronograma p/ o cadastro
  const lerPdfNovo = async (file: File) => {
    setPdfLendoNovo(true);
    try {
      const texto = await extrairTextoPdf(file);
      const linhas = extrairCronograma(texto);
      if (!linhas.length) throw new Error("Nenhuma parcela encontrada no PDF (esperado: Nº + data + R$ valor)");
      const cab = extrairCabecalhoPdf(texto);
      if (cab.principal) setPrincipal(cab.principal);
      if (cab.taxa) setTaxa(cab.taxa);
      if (cab.primeiro) setPrimeiro(cab.primeiro);
      if (cab.contratacao) setContratacao(cab.contratacao);
      setParcelas(String(linhas.length));
      setPdfNovo({ linhas, total: linhas.reduce((s, l) => s + l.valor, 0) });
      toast.success(`PDF lido: ${linhas.length} parcelas`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler o PDF");
    } finally {
      setPdfLendoNovo(false);
      if (pdfNovoRef.current) pdfNovoRef.current.value = "";
    }
  };

  const gerarContasPagar = useMutation({
    mutationFn: async (emprestimoId: string) => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const pendentes = parcelasSel.filter((p) => !p.lancamento_id && p.status === "aberta");
      if (!pendentes.length) throw new Error("Nenhuma parcela pendente sem lançamento");
      const emp = (lista ?? []).find((e) => e.id === emprestimoId);
      for (const p of pendentes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: lanc, error } = await (supabase.from("lancamentos_financeiros") as any).insert({
          empresa_id: empresa.id, tipo: "pagar", status: "aberto",
          descricao: `${emp?.descricao ?? "Empréstimo"} — parcela ${p.numero}/${emp?.parcelas ?? ""}`,
          valor: p.valor, data_emissao: format(new Date(), "yyyy-MM-dd"), data_vencimento: p.data_vencimento,
        }).select("id").single();
        if (error) throw error;
        await supabase.from("emprestimo_parcelas" as never)
          .update({ lancamento_id: lanc.id } as never).eq("id", p.id);
      }
    },
    onSuccess: () => {
      toast.success("Contas a pagar geradas");
      qc.invalidateQueries({ queryKey: ["emprestimo-parcelas"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("emprestimos" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contrato excluído");
      setSel(null);
      qc.invalidateQueries({ queryKey: ["emprestimos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emprestimoSel = (lista ?? []).find((e) => e.id === sel) ?? null;
  const somaParcelasSel = parcelasSel.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = q.replace(/\D/g, "");
    if (!q) return lista ?? [];
    return (lista ?? []).filter((e) => {
      if ((e.descricao || "").toLowerCase().includes(q)) return true;
      if ((e.credor || "").toLowerCase().includes(q)) return true;
      // Pesquisa por valor: "25,00" acha 25000.00 (a partir de 2 dígitos)
      if (qDig.length >= 2 && Number(e.valor_principal || 0).toFixed(2).replace(/\D/g, "").includes(qDig)) return true;
      return false;
    });
  }, [lista, busca]);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        title="Empréstimos e financiamentos"
        description="Controle contratos e ajuste cada parcela (valor e vencimento) quando o banco usar carência ou valores diferentes do Price. Depois, gere as contas a pagar."
      />
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 rounded-xl pl-10 shadow-sm" placeholder="Buscar por descrição, credor ou valor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button className="h-10 rounded-xl px-5 shadow-md transition-all hover:-translate-y-px hover:shadow-lg"><Plus className="mr-1.5 h-4 w-4" /> Novo contrato</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:w-full">
              <DialogHeader className="gap-1.5 pb-1"><DialogTitle className="tracking-tight">Novo contrato</DialogTitle></DialogHeader>
              <input
                ref={pdfNovoRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                aria-label="Selecionar PDF do banco"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void lerPdfNovo(f);
                }}
              />
              {!pdfNovo ? (
                <Button variant="outline" onClick={() => pdfNovoRef.current?.click()} disabled={pdfLendoNovo} className="h-10 rounded-xl">
                  <FileUp className="mr-1.5 h-4 w-4" /> {pdfLendoNovo ? "Lendo PDF…" : "Ler PDF do banco e preencher"}
                </Button>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/50 p-3 text-sm shadow-sm">
                  <span className="leading-relaxed text-muted-foreground">
                    PDF lido: <strong className="text-foreground">{pdfNovo.linhas.length} parcelas</strong> ·
                    Total <strong className="text-foreground">{brl(pdfNovo.total)}</strong>
                    <br />
                    O contrato será criado com o cronograma do banco.
                  </span>
                  <Button size="sm" variant="ghost" aria-label="Descartar PDF" onClick={() => setPdfNovo(null)} className="h-8 w-8 shrink-0 rounded-lg">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                      <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="emprestimo">Empréstimo</SelectItem>
                        <SelectItem value="financiamento">Financiamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Credor</Label>
                    <Input value={credor} onChange={(e) => setCredor(e.target.value)} placeholder="Banco / instituição" className="h-10 rounded-xl" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Descrição</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Capital de giro" className="h-10 rounded-xl" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>Valor contratado</Label>
                    <MoneyInput value={principal} onChange={setPrincipal} className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Juros % a.m.</Label>
                    <MoneyInput prefix="" value={taxa} onChange={setTaxa} className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Parcelas</Label>
                    <MoneyInput prefix="" decimals={0} value={parcelas} onChange={setParcelas} className="h-10" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Contratação</Label>
                    <DateInput value={contratacao} onChange={setContratacao} className="h-10" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>1º vencimento</Label>
                    <DateInput value={primeiro} onChange={setPrimeiro} className="h-10" />
                  </div>
                </div>
                {previa && !pdfNovo && (
                  <p className="rounded-xl border bg-muted/50 p-3.5 text-sm leading-relaxed text-muted-foreground shadow-sm">
                    Parcela estimada: <strong className="text-foreground">{brl(previa.parcela)}</strong> ·
                    Total a pagar: <strong className="text-foreground">{brl(previa.total)}</strong>
                    <br />
                    Valores iguais (Price). Se o banco usar carência ou parcelas diferentes,
                    leia o PDF acima ou ajuste cada parcela na lista do contrato.
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2">
                <Button onClick={() => criar.mutate()} disabled={criar.isPending} className="h-10 rounded-xl px-6 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
                  {criar.isPending ? "Salvando..." : "Cadastrar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : !lista?.length ? (
        <EmptyState
          icon={Banknote}
          title="Nenhum contrato"
          description="Cadastre empréstimos e financiamentos para acompanhar parcelas, juros e impacto no fluxo de caixa."
        />
      ) : !filtrados.length ? (
        <EmptyState
          icon={Banknote}
          title="Nenhum contrato encontrado"
          description="Nada encontrado para a busca."
        />
      ) : (
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_1.2fr]">
          <Card className="overflow-hidden rounded-2xl shadow-panel">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Parc.</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((e) => (
                  <TableRow
                    key={e.id}
                    className={sel === e.id ? "bg-muted/50" : "cursor-pointer transition-colors hover:bg-accent/30"}
                    onClick={() => setSel(e.id)}
                  >
                    <TableCell>
                      <div className="font-medium tracking-tight">{e.descricao}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {e.tipo === "financiamento" ? "Financiamento" : "Empréstimo"}
                        {e.credor ? ` · ${e.credor}` : ""} · {dateBR(e.data_contratacao)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-tabular font-medium">{brl(e.valor_principal)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-tabular">{e.parcelas}x</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="overflow-hidden rounded-2xl shadow-panel">
            {!emprestimoSel ? (
              <p className="p-8 text-center text-sm leading-relaxed text-muted-foreground">Selecione um contrato para ver as parcelas.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold tracking-tight">{emprestimoSel.descricao}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {emprestimoSel.parcelas}x · {Number(emprestimoSel.taxa_juros_mensal)}% a.m. · Soma das parcelas: <strong className="text-foreground">{brl(somaParcelasSel)}</strong>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => gerarContasPagar.mutate(emprestimoSel.id)}
                      disabled={gerarContasPagar.isPending}
                      className="h-9 rounded-xl px-4 shadow-sm"
                    >
                      <HandCoins className="mr-1.5 h-4 w-4" /> Gerar contas a pagar
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Excluir contrato" onClick={() => excluir.mutate(emprestimoSel.id)} className="h-9 w-9 rounded-xl">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Parcela</TableHead>
                        <TableHead className="text-right">Juros</TableHead>
                        <TableHead className="text-right">Amortização</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parcelasSel.map((p) => {
                        const editando = editParc?.id === p.id;
                        return (
                        <TableRow key={p.id} className="transition-colors hover:bg-accent/30">
                          <TableCell>{p.numero}</TableCell>
                          <TableCell>
                            {editando ? (
                              <DateInput value={editParc.venc} onChange={(v) => setEditParc({ ...editParc, venc: v })} className="h-8 text-xs" />
                            ) : (
                              dateBR(p.data_vencimento)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {editando ? (
                              <MoneyInput value={editParc.valor} onChange={(v) => setEditParc({ ...editParc, valor: v })} className="h-8 text-xs" />
                            ) : (
                              brl(p.valor)
                            )}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">{brl(p.valor_juros)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{brl(p.valor_amortizacao)}</TableCell>
                          <TableCell>
                            <Badge variant={p.lancamento_id ? "secondary" : "outline"}>
                              {p.lancamento_id ? "Lançada" : "Aberta"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {editando ? (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" aria-label="Salvar parcela" onClick={() => salvarParcela.mutate()} disabled={salvarParcela.isPending} className="h-8 w-8 rounded-lg">
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" aria-label="Cancelar edição" onClick={() => setEditParc(null)} className="h-8 w-8 rounded-lg">
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : !p.lancamento_id ? (
                              <Button
                                size="sm" variant="ghost" aria-label={`Ajustar parcela ${p.numero}`}
                                title="Ajustar valor e vencimento"
                                onClick={() => setEditParc({ id: p.id, valor: String(p.valor ?? 0), venc: p.data_vencimento })}
                                className="h-8 w-8 rounded-lg"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
