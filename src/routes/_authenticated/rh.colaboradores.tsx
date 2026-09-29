/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas novas ainda não estão em types.ts; padrão do projeto é cast as never/as any */
import { createFileRoute } from "@tanstack/react-router";
import { DateInput } from "@/components/erp/date-input";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/erp/money-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Users, Pencil, Plus, Trash2, X, FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rh/colaboradores")({
  component: ColaboradoresPage,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Erro: {error.message}
    </div>
  ),
});

type Colab = {
  id: string;
  codigo: number;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  salario_base: number;
  data_admissao: string | null;
  data_demissao: string | null;
  status: string;
  pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  observacoes: string | null;
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  toxico_exame: string | null;
  optante_vt: boolean;
  data_nascimento?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};

const STATUS: Record<string, string> = {
  afastado: "Afastado",
  ativo: "Ativo",
  demitido: "Demitido",
  ferias: "Férias",
  suspenso: "Suspenso",
};

const soDigitos = (s: string) => s.replace(/\D/g, "");

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

// Máscara progressiva de telefone; vários números separados por ;
// ao completar 11 dígitos e continuar digitando, o ; entra sozinho.
function mascaraFone(dig: string) {
  const d = dig.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function mascaraTelefones(v: string) {
  const parts: string[] = [];
  for (const s of v.split(";")) {
    let dig = s.replace(/\D/g, "");
    if (!dig) continue;
    while (dig.length > 11) {
      parts.push(mascaraFone(dig.slice(0, 11)));
      dig = dig.slice(11);
    }
    parts.push(mascaraFone(dig));
  }
  return parts.join("; ");
}

const soma30meses = (d: string) => {
  const dt = new Date(d + "T00:00:00");
  dt.setMonth(dt.getMonth() + 30);
  return dt.toISOString().slice(0, 10);
};

function avisoToxico(validade: string | null | undefined) {
  if (!validade) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(validade + "T00:00:00");
  const dias = Math.round((v.getTime() - hoje.getTime()) / 86400000);
  if (dias < 0) return `Toxicológico VENCIDO há ${-dias} dias`;
  if (dias === 0) return "Toxicológico vence HOJE";
  if (dias <= 60) return `Toxicológico vence em ${dias} dias`;
  return null;
}

function validarForm(form: ReturnType<typeof formInicial>) {
  if (!form.nome.trim()) throw new Error("Nome é obrigatório");
  if (soDigitos(form.cpf).length !== 11) throw new Error("CPF deve ter 11 dígitos");
  if (!form.cargo.trim()) throw new Error("Cargo é obrigatório");
  if (form.cargo.toLowerCase().includes("motorist")) {
    if (!form.cnh_numero.trim())
      throw new Error("Para o cargo de motorista, informe o número da CNH");
    if (!form.cnh_categoria.trim())
      throw new Error("Para o cargo de motorista, informe a categoria da CNH");
    if (!form.toxico_exame)
      throw new Error("Para o cargo de motorista, informe a data do último exame toxicológico");
  }
  const tels = form.telefone
    .split(/[;/]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tels.length === 0) throw new Error("Informe pelo menos um telefone");
  for (const t of tels)
    if (soDigitos(t).length < 10) throw new Error(`Telefone inválido: "${t}" (use DDD + número)`);
  if (!form.data_admissao) throw new Error("Data de admissão é obrigatória");
  if (form.status === "demitido" && !form.data_demissao)
    throw new Error("Informe a data de demissão para colaboradores demitidos");
}

function formInicial() {
  return {
    nome: "",
    cpf: "",
    cargo: "",
    email: "",
    telefone: "",
    salario_base: "0",
    data_admissao: "",
    data_demissao: "",
    status: "ativo",
    pix: "",
    banco: "",
    agencia: "",
    conta: "",
    observacoes: "",
    cnh_numero: "",
    cnh_categoria: "",
    cnh_validade: "",
    toxico_exame: "",
    toxico_validade: "",
    optante_vt: false,
    data_nascimento: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
  };
}

// Colunas novas (migration 20260929140000). O app funciona antes dela ser aplicada:
// o save tenta com elas e, se o banco recusar (coluna inexistente), regrava sem elas.
const COLS_NOVAS = [
  "data_nascimento",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "cep",
] as const;
let cacheColabNovos: boolean | null = null;
async function temColunasNovas(): Promise<boolean> {
  if (cacheColabNovos !== null) return cacheColabNovos;
  try {
    const { error } = await supabase
      .from("colaboradores" as never)
      .select("data_nascimento")
      .limit(0);
    cacheColabNovos =
      !error || !/data_nascimento|column|PGRST204/i.test((error as any)?.message ?? "");
  } catch {
    cacheColabNovos = true;
  }
  return cacheColabNovos;
}

function ColaboradoresPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Colab | null>(null);
  const [form, setForm] = useState(formInicial);
  const [pagina, setPagina] = useState(1);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Nome válido: só palavras de 2+ letras (PT) desde o início; PARA na 1ª inválida.
  // Corta sobra de 1-2 letras no FIM ("ES" solto do OCR), preservando conectores
  // reais (DA/DE/DO/DAS/DOS/E) e nomes curtos (mínimo 2 palavras no fim).
  // Exige ao menos 2 palavras. "" = descartado.
  // Antes de validar, descarta enchimento de rótulo no INÍCIO ("E SOBRENOME",
  // "SOBRENOME", "NOME") — modelo digital novo traz "2 e 1 NOME E SOBRENOME
  // ROBERTO DE SOUZA" tudo grudado.
  const FILLER_INICIO = new Set(["E", "NOME", "SOBRENOME", "SOBRENOMES"]);
  function limparNome(bruto: string): string {
    const toks = bruto.split(/\s+/).filter(Boolean);
    let ini = 0;
    while (ini < toks.length && FILLER_INICIO.has(toks[ini])) ini++;
    const boas: string[] = [];
    for (const p of toks.slice(ini)) {
      if (/^[A-ZÀÁÂÃÇÉÊÍÓÔÕÚ]{2,}$/.test(p)) boas.push(p);
      else break;
    }
    while (
      boas.length >= 4 &&
      boas[boas.length - 1].length <= 2 &&
      !["DA", "DE", "DI", "DO", "DU", "DAS", "DES", "DOS", "E"].includes(boas[boas.length - 1])
    ) {
      boas.pop();
    }
    return boas.length >= 2 ? boas.join(" ") : "";
  }

  // Extrai nome/CPF/CNH de um texto (camada de texto do PDF ou OCR) — retorna o que achou.
  // Tenta rótulo+valor adjacentes e, se o OCR embaralhar a ordem, busca por proximidade/linhas.
  // Cobre 2 modelos digitais: o antigo e o novo (cabeçalho gov.br + QR-CODE + MRZ com <<< no rodapé).
  function extrairCamposCnh(texto: string): string[] {
    const T = texto.replace(/\s+/g, " ");
    const linhas = texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const achados: string[] = [];
    // 0) MRZ do modelo novo (3 linhas com <<< no rodapé) — fonte mais confiável:
    //    L1: I<BRA<registro>...  L2: <nasc YYMMDD>M<valid YYMMDD>...  L3: NOME<<SOBRENOME<<<<
    {
      const mrz = linhas.filter((l) => /<{3,}/.test(l));
      if (mrz.length >= 2) {
        const blob = mrz.join(" ");
        const datas = blob.match(/(\d{6})\d?[MF<](\d{6})/);
        const convNasc = (yy: string, mm: string, dd: string) => {
          const ano = Number(yy) > Number(String(new Date().getFullYear()).slice(2)) ? 1900 + Number(yy) : 2000 + Number(yy);
          return `${ano}-${mm}-${dd}`;
        };
        if (datas) {
          set("data_nascimento", convNasc(datas[1].slice(0, 2), datas[1].slice(2, 4), datas[1].slice(4, 6)));
          if (!achados.includes("nascimento")) achados.push("nascimento");
          set("cnh_validade", `20${datas[2].slice(0, 2)}-${datas[2].slice(2, 4)}-${datas[2].slice(4, 6)}`);
          if (!achados.includes("validade")) achados.push("validade");
        }
        const lnome = mrz.find((l) => /^[A-Z]/.test(l) && !/^I</.test(l) && /<</.test(l));
        if (lnome) {
          const nm = lnome
            .replace(/</g, " ")
            .replace(/[^A-ZÀ-ÚÃÕÇÉÍÓÚÂÊÔ ]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const limpo = limparNome(nm);
          if (limpo) {
            set("nome", limpo);
            achados.push("nome");
          }
        }
      }
    }
    // CPF + nascimento lado a lado (layout da CNH: "136.983.846-80 18/07/1993")
    const par = T.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})/);
    const cpf = par?.[1] ?? T.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/)?.[1] ?? "";
    if (cpf) {
      set("cpf", cpf);
      achados.push("CPF");
    }
    if (par) {
      set("data_nascimento", `${par[4]}-${par[3]}-${par[2]}`);
      achados.push("nascimento");
    }
    // Valor N caracteres APÓS um rótulo (p/ OCR com ordem embaralhada)
    const apos = (rotulo: RegExp, captura: RegExp, janela = 120) => {
      const m = T.match(rotulo);
      if (!m || m.index === undefined) return "";
      const ini = m.index + m[0].length;
      return T.slice(ini, ini + janela).match(captura)?.[1]?.trim() ?? "";
    };
    let nome = achados.includes("nome") ? "__MRZ__" : "";
    // 1º) Linha seguinte ao rótulo NOME (layout do documento — o mais confiável no OCR)
    {
      const idx = linhas.findIndex(
        (l) => /NOME(\s+E\s+SOBRENOME)?\b/i.test(l) && l.replace(/NOME|SOBRENOME/gi, "").replace(/[\dªº]/g, "").replace(/\be\b/gi, "").trim().length < 6,
      );
      if (idx >= 0 && !nome) {
        // Mesmo rótulo + valor na mesma linha ("NOME E SOBRENOME ROBERTO DE SOUZA")
        const mesma = linhas[idx].replace(/^\s*\d*\s*(e\s+)?\d*\s*NOME(\s+E\s+SOBRENOME)?/i, " ").trim();
        if (mesma.length > 3) nome = limparNome(mesma);
        for (let j = idx + 1; j < linhas.length && j < idx + 4 && !nome; j++) {
          console.log("[CNH-OCR] nome linha?", JSON.stringify(linhas[j]));
          nome = limparNome(linhas[j]);
        }
      }
    }
    // 1b) Modelo novo: "NOME E SOBRENOME <nome> 1ª HABILITAÇÃO/data" tudo na mesma linha
    if (!nome) {
      const m = T.match(/NOME(\s+E\s+SOBRENOME)?\s+([A-ZÀ-ÚÃÕÇÉÍÓÚÂÊÔ ]{3,70}?)(?=\s*(?:\d|1[ªa]|DOC\b|CPF\b|CNH\b|DATA\b|CATEG|VALID|HABIL|FILIAC|NACIONALIDADE|NATURALIDADE|ASS\b|LOCAL\b|OBS\b|MINAS|GERAIS|BRASIL))/i);
      if (m) nome = limparNome(m[2]);
    }
    // 2º) Rótulo+valor adjacentes
    if (!nome) {
      nome =
        T.match(/NOME\s+([A-ZÀ-ÚÃÕÇÉÍÓÚÂÊÔ ]{6,60}?)(?=\s+(?:DOC|CPF|RG|CNH|DATA|CATEG|VALID|HABIL|FILIAC|NACIONALIDADE|NATURALIDADE|ASS|LOCAL|OBS))/)
          ?.[1]?.trim() ?? "";
    }
    if (!nome || nome === "__MRZ__") {
      // 3º) Fallback: remove palavras-rótulo e pega a 1ª sequência longa em maiúsculas
      // (cabeçalho REPÚBLICA/MINISTÉRIO nunca vale como nome)
      const limpo = apos(/NOME/, /(.{10,200})/, 200)
        .replace(/\b(NOME|DOC|IDENTIDADE|ORG|ORGAO|EMISSOR|UF|CPF|DATA|NASCIMENTO|FILIA[CÇ][AÃ]O|CATEGORIA|CAT|HAB|VALIDADE|PERMISSAO|ACC|REGISTRO|RENACH|HABILITA[CÇ][AÃ]O|OBSERVA[CÇ][OÕ]ES|LOCAL|EMISSAO)\b\.?/gi, " ")
        .replace(/[^A-ZÀ-ÚÃÕÇÉÍÓÚÂÊÔ ]/g, " ");
      const cands = limpo.match(/[A-ZÀ-ÚÃÕÇÉÍÓÚÂÊÔ ]{6,60}/g) ?? [];
      const STOP = /REPUBLICA|FEDERATIVA|BRASIL|MINISTERIO|TRANSPORTES|TRANSITO|SENATRAN|CARTEIRA|HABILITACAO|PERMISO|CONDUCCION|DRIVER|LICENSE|SOBRENOME/;
      nome =
        cands.map((c) => limparNome(c.trim())).find((c) => c && !STOP.test(c)) ?? "";
    }
    // Filtra o que veio dos regexes (vale p/ todos os caminhos acima)
    if (nome !== "__MRZ__") nome = limparNome(nome);
    // Validação rígida final (vale p/ todos os caminhos acima)
    console.log("[CNH-OCR] nome bruto", JSON.stringify(nome));
    if (nome !== "__MRZ__") nome = limparNome(nome);
    // Importar = ação explícita: sempre preenche com o lido (inclusive por cima de
    // valor sujo de importação anterior)
    if (nome && nome !== "__MRZ__") {
      set("nome", nome);
      achados.push("nome");
    }
    let reg =
      T.match(/(?:N[ºo]\s*\.?\s*(?:REGISTRO|RENACH)|RENACH|REGISTRO)\s*\D{0,10}(\d{9,12})/i)?.[1] ??
      T.match(/\bN[ºo]?\s*REGISTRO\D{0,10}(\d[\d ]{8,14}\d)/i)?.[1]?.replace(/\D/g, "") ??
      apos(/REGISTRO|RENACH/i, /(\d{9,12})/, 80);
    if (!reg) {
      // Linha do rótulo Nº REGISTRO + próximas 3 (datas excluídas p/ não contaminar)
      const idxR = linhas.findIndex((l) => /REGISTRO|RENACH/i.test(l));
      for (let j = Math.max(0, idxR); j < linhas.length && j < idxR + 4 && !reg; j++) {
        const semDatas = linhas[j].replace(/\d{2}\/\d{2}\/\d{4}/g, " ");
        const runs = semDatas.match(/\d(?:[\d ]*\d)?/g) ?? [];
        for (const r of runs) {
          const dig = r.replace(/\D/g, "");
          if (/^\d{9,12}$/.test(dig)) {
            reg = dig;
            break;
          }
        }
      }
    }
    if (reg) {
      set("cnh_numero", reg);
      achados.push("nº CNH");
    }
    const cat =
      T.match(/CATEGORIA(?:\s+HAB\.?)?\s*([A-E]{1,2})\b/i)?.[1]?.toUpperCase() ??
      T.match(/\bCAT\.?\s*HAB\.?\s*([A-E]{1,2})\b/i)?.[1]?.toUpperCase() ??
      apos(/CAT\.?\s*HAB|CATEGORIA/i, /\b([A-E]{1,2})\b/, 120).toUpperCase();
    if (cat && ["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"].includes(cat)) {
      set("cnh_categoria", cat);
      achados.push("categoria " + cat);
    }
    // Modelo novo: "4b VALIDADE 27/12/2028" e "3 DATA, LOCAL E UF DE NASCIMENTO 03/01/1964,..."
    const val =
      T.match(/VALIDADE\s*(\d{2})\/(\d{2})\/(\d{4})/)?.slice(1) ??
      T.match(/\bVALID(?:ADE|E)?\D{0,15}(\d{2})\/(\d{2})\/(\d{4})/)?.slice(1) ??
      (() => {
        const m = apos(/VALID/i, /(\d{2}\/\d{2}\/\d{4})/, 60).match(/(\d{2})\/(\d{2})\/(\d{4})/);
        return m ? m.slice(1) : [];
      })();
    if (val.length === 3 && !achados.includes("validade")) {
      set("cnh_validade", `${val[2]}-${val[1]}-${val[0]}`);
      achados.push("validade");
    }
    const nasc =
      T.match(/DATA NASCIMENTO[^0-9]{0,20}(\d{2})\/(\d{2})\/(\d{4})/)?.slice(1) ??
      T.match(/NASCIMENTO\D{0,40}(\d{2})\/(\d{2})\/(\d{4})/)?.slice(1) ??
      T.match(/DATA\D{0,40}NASCIMENTO\D{0,40}(\d{2})\/(\d{2})\/(\d{4})/)?.slice(1) ??
      [];
    if (nasc.length === 3 && !achados.includes("nascimento")) {
      set("data_nascimento", `${nasc[2]}-${nasc[1]}-${nasc[0]}`);
      achados.push("nascimento");
    }
    return achados;
  }

  // OCR da imagem da CNH (a CNH digital exporta o documento como imagem): renderiza a
  // página, recorta a região do documento e lê com tesseract (português).
  // Retorna o texto e o canvas da página (p/ a passada de dígitos do nº da CNH).
  async function ocrCnh(
    pdf: any,
  ): Promise<{ texto: string; canvas: HTMLCanvasElement | null; orig: HTMLCanvasElement | null }> {
    const { createWorker } = await import("tesseract.js");
    const page = await pdf.getPage(1);
    const scale = 3;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    await page.render({ canvasContext: ctx, viewport }).promise;
    // Cópia íntegra (sem threshold) p/ os dígitos vermelhos do nº da CNH
    let orig: HTMLCanvasElement | null = null;
    try {
      orig = document.createElement("canvas");
      orig.width = canvas.width;
      orig.height = canvas.height;
      orig.getContext("2d")?.drawImage(canvas, 0, 0);
    } catch {}
    // Pré-processamento: cinza + contraste (fundo verde da CNH atrapalha o OCR)
    try {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const c = g < 110 ? 0 : g > 190 ? 255 : Math.round((g - 110) * 3.2);
        d[i] = d[i + 1] = d[i + 2] = c;
      }
      ctx.putImageData(img, 0, 0);
    } catch {}
    // Recorte da região do documento (esquerda/topo); fallback: página inteira
    const recortes = [
      { x: 0, y: 0.05, w: 0.62, h: 0.5 },
      { x: 0, y: 0, w: 1, h: 1 },
    ];
    const worker = await createWorker("por");
    try {
      for (const r of recortes) {
        const c = document.createElement("canvas");
        c.width = Math.floor(canvas.width * r.w);
        c.height = Math.floor(canvas.height * r.h);
        c.getContext("2d")?.drawImage(
          canvas,
          Math.floor(canvas.width * r.x),
          Math.floor(canvas.height * r.y),
          c.width,
          c.height,
          0,
          0,
          c.width,
          c.height,
        );
        const { data } = await worker.recognize(c);
        console.log("[CNH-OCR] recorte", r, (data?.text ?? "").slice(0, 600));
        if ((data?.text ?? "").replace(/\s/g, "").length > 30)
          return { texto: data.text, canvas, orig };
      }
      return { texto: "", canvas, orig };
    } finally {
      await worker.terminate();
    }
  }

  // Segunda passada p/ o nº da CNH: renderiza a página em escala alta e lê a caixa
  // Nº REGISTRO (canto esquerdo do cartão, abaixo da foto). Só aceita sequência
  // limpa de 9-12 dígitos — nunca concatena fragmentos.
  async function ocrDigitosRegistro(pdf: any): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const page = await pdf.getPage(1);
    const scale = 6;
    const viewport = page.getViewport({ scale });
    const full = document.createElement("canvas");
    full.width = Math.floor(viewport.width);
    full.height = Math.floor(viewport.height);
    const fctx = full.getContext("2d");
    if (!fctx) return "";
    await page.render({ canvasContext: fctx, viewport }).promise;
    // Caixa Nº REGISTRO: terço superior esquerdo do cartão, abaixo da foto
    // (nº vertical da esquerda é preto/rotacionado — fora destes recortes)
    const caixas = [
      { x: 0.12, y: 0.23, w: 0.2, h: 0.08 },
      { x: 0.1, y: 0.21, w: 0.24, h: 0.11 },
    ];
    const worker = await createWorker("por");
    try {
      for (const r of caixas) {
        const c = document.createElement("canvas");
        const x = Math.floor(full.width * r.x);
        const y = Math.floor(full.height * r.y);
        const w = Math.floor(full.width * r.w);
        const h = Math.floor(full.height * r.h);
        if (w < 10 || h < 10) continue;
        c.width = w;
        c.height = h;
        const g = c.getContext("2d");
        if (!g) continue;
        g.drawImage(full, x, y, w, h, 0, 0, c.width, c.height);
        try {
          const img = g.getImageData(0, 0, c.width, c.height);
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const gr = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            d[i] = d[i + 1] = d[i + 2] = gr;
          }
          g.putImageData(img, 0, 0);
        } catch {}
        for (const psm of [8, 7, 6]) {
          await worker.setParameters({
            tessedit_char_whitelist: "0123456789",
            tessedit_pageseg_mode: psm as any,
          });
          const { data } = await worker.recognize(c);
          const t = data?.text ?? "";
          console.log(
            "[CNH-OCR] caixa",
            JSON.stringify(r),
            "psm" + psm,
            JSON.stringify(t.slice(0, 200)),
          );
          const runs = t.match(/\d(?:[\d ]*\d)?/g) ?? [];
          // Tokens separados (nº e data lado a lado NÃO podem se juntar)
          const semDatas = t.replace(/\d{2}\/\d{2}\/\d{4}/g, " ");
          const toks = semDatas.split(/\s+/);
          for (const tk of toks) {
            const dig = tk.replace(/\D/g, "");
            if (/^\d{9,12}$/.test(dig)) return dig;
          }
          // Nº quebrado em 2 pedaços pelo OCR: junta vizinhos (sem / entre eles)
          const onlyDig = toks
            .map((tk) => tk.replace(/\D/g, ""))
            .filter((d) => /^\d+$/.test(d));
          for (let i = 0; i < onlyDig.length - 1; i++) {
            const m = onlyDig[i] + onlyDig[i + 1];
            if (/^\d{9,12}$/.test(m)) return m;
          }
          for (const run of runs) {
            const dig = run.replace(/\D/g, "");
            if (/^\d{9,12}$/.test(dig)) {
              const idx = t.indexOf(run);
              const antes = t.slice(Math.max(0, idx - 3), idx);
              const depois = t.slice(idx + run.length, idx + run.length + 3);
              if (!antes.includes("/") && !depois.includes("/")) return dig;
            }
          }
        }
      }
      return "";
    } finally {
      await worker.terminate();
    }
  }

  // Lê o PDF da CNH e preenche nome/CPF/CNH — texto direto ou OCR da imagem
  async function importarCnhPdf(file: File) {
    try {
      toast.info("Lendo PDF da CNH…");
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let texto = "";
      for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const items = (tc.items as any[]).filter((it) => typeof it?.str === "string" && it.str.trim());
        // Agrupa por linha (coord Y do transform) p/ preservar "rótulo numa linha,
        // valor na seguinte" — o modelo novo traz tudo em caixas separadas.
        try {
          const rows = new Map<number, any[]>();
          for (const it of items) {
            const y = Array.isArray(it.transform) ? Math.round(Number(it.transform[5]) / 2) : 0;
            if (!rows.has(y)) rows.set(y, []);
            rows.get(y)!.push(it);
          }
          const ys = [...rows.keys()].sort((a, b) => b - a);
          for (const y of ys) {
            const row = rows.get(y)!.sort((a, b) => Number(a.transform?.[4] ?? 0) - Number(b.transform?.[4] ?? 0));
            texto += row.map((it) => it.str.trim()).join(" ") + "\n";
          }
        } catch {
          texto += items.map((it) => it.str).join(" ") + "\n";
        }
      }
      let achados = texto.replace(/\s/g, "").length >= 50 ? extrairCamposCnh(texto) : [];
      if (achados.length === 0) {
        toast.info("Lendo imagem do documento (OCR)… pode levar alguns segundos");
        const ocr = await ocrCnh(pdf);
        if (ocr.texto) achados = extrairCamposCnh(ocr.texto);
      }
      if (!achados.includes("nº CNH")) {
        const reg = await ocrDigitosRegistro(pdf);
        if (reg) {
          set("cnh_numero", reg);
          achados.push("nº CNH");
        }
      }
      if (achados.length === 0) toast.warning("Nada reconhecido no PDF. Preencha manualmente.");
      else
        toast.success(
          `CNH lida: ${achados.join(", ")}` +
            (achados.includes("nº CNH") ? "" : " (nº da CNH não lido — está abaixo da foto)"),
        );
    } catch (e: any) {
      toast.error("Falha ao ler PDF", { description: e?.message });
    }
  }

  const { data: colabs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["colaboradores", empresa?.id],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
      queryFn: async () => {
        const comNovas = await temColunasNovas();
        const { data, error } = await supabase
          .from("colaboradores" as never)
          .select(
            "id,codigo,nome,cpf,cargo,email,telefone,salario_base,data_admissao,data_demissao,status,pix,banco,agencia,conta,observacoes,cnh_numero,cnh_categoria,cnh_validade,toxico_exame,optante_vt" +
              (comNovas ? ",data_nascimento,logradouro,numero,complemento,bairro,cidade,uf,cep" : ""),
          )
          .eq("empresa_id", empresa!.id)
          .order("nome")
          .limit(500);
        if (error) throw error;
        return (data ?? []) as unknown as Colab[];
      },
  });

  const pageSize = 25;
  const totalPaginas = Math.max(1, Math.ceil((colabs?.length ?? 0) / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  // Ordenação da listagem (padrão: nome A-Z); cabeçalhos clicáveis.
  const [ordem, setOrdem] = useState<{
    key: "codigo" | "nome" | "cargo" | "status" | "data_admissao" | "salario_base";
    dir: 1 | -1;
  }>({ key: "nome", dir: 1 });
  const colabsOrdenados = useMemo(() => {
    const arr = [...(colabs ?? [])];
    const val = (c: Colab): string | number => {
      if (ordem.key === "codigo") return Number(c.codigo ?? 0);
      if (ordem.key === "salario_base") return Number(c.salario_base ?? 0);
      if (ordem.key === "data_admissao") return c.data_admissao || "";
      if (ordem.key === "status") return STATUS[c.status] ?? c.status;
      return String(c[ordem.key] ?? "").toLocaleLowerCase();
    };
    arr.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const r =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "pt-BR");
      return r * ordem.dir;
    });
    return arr;
  }, [colabs, ordem]);
  const colabsVisiveis = colabsOrdenados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const alternarOrdem = (key: typeof ordem.key) => {
    setOrdem((o) => (o.key === key ? { key, dir: o.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
    setPagina(1);
  };
  const setaOrdem = (key: typeof ordem.key) =>
    ordem.key === key ? (ordem.dir === 1 ? " ▲" : " ▼") : "";

  const { data: cargos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["cargos", empresa?.id],
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("cargos" as never)
        .select("id,nome,empresa_id")
        .or(`empresa_id.is.null,empresa_id.eq.${empresa!.id}`)
        .order("empresa_id", { ascending: false })
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; nome: string; empresa_id: string | null }[];
    },
  });

  // quantos funcionários usam cada cargo (vínculo pelo NOME do cargo)
  const usoCargo = (nome: string) =>
    (colabs ?? []).filter((x) => (x.cargo ?? "").trim().toLowerCase() === nome.trim().toLowerCase())
      .length;

  // autocomplete do campo cargo: mostra todos ao focar, filtra conforme digita
  const [cargoFoco, setCargoFoco] = useState(false);
  const cargoSugestoes = useMemo(() => {
    const q = form.cargo.trim().toLowerCase();
    const nomes: string[] = [];
    for (const c of cargos) {
      if (
        (!q || c.nome.toLowerCase().includes(q)) &&
        !nomes.some((n) => n.toLowerCase() === c.nome.toLowerCase())
      ) {
        nomes.push(c.nome);
      }
    }
    return nomes.slice(0, 50);
  }, [cargos, form.cargo]);

  const [cargosOpen, setCargosOpen] = useState(false);
  const [novoCargo, setNovoCargo] = useState("");
  const [cargoEditId, setCargoEditId] = useState<string | null>(null);
  const [cargoEditNome, setCargoEditNome] = useState("");

  // Municípios do IBGE (todas as cidades do Brasil), com cache local
  type Mun = { nome: string; uf: string };
  const [municipios, setMunicipios] = useState<Mun[]>([]);
  const [cidadeFoco, setCidadeFoco] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const raw = localStorage.getItem("ibge-municipios-v1");
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 5000) {
            if (vivo) setMunicipios(arr);
            return;
          }
        }
        const r = await fetch(
          "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
        );
        const j = await r.json();
        const arr = (j as any[]).map((m) => ({
          nome: String(m.nome ?? ""),
          uf: String(m.microrregiao?.mesorregiao?.UF?.sigla ?? ""),
        }));
        try {
          localStorage.setItem("ibge-municipios-v1", JSON.stringify(arr));
        } catch {}
        if (vivo) setMunicipios(arr);
      } catch {}
    })();
    return () => {
      vivo = false;
    };
  }, []);
  const cidadeSugestoes = useMemo(() => {
    const q = form.cidade.trim().toLowerCase();
    return municipios
      .filter((m) => (!form.uf || m.uf === form.uf) && (!q || m.nome.toLowerCase().includes(q)))
      .slice(0, 50);
  }, [municipios, form.cidade, form.uf]);

  // ViaCEP: preenche endereço pelo CEP
  async function buscarCep() {
    const d = form.cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((f) => ({
        ...f,
        logradouro: f.logradouro || j.logradouro || "",
        bairro: f.bairro || j.bairro || "",
        cidade: j.localidade || f.cidade,
        uf: j.uf || f.uf,
      }));
      toast.success("Endereço preenchido pelo CEP");
    } catch {
      toast.error("Falha ao buscar CEP");
    }
  }

  // filtra a lista de cargos conforme o campo "novo cargo" (vazio = mostra todos), ordem alfabética
  const cargosFiltrados = useMemo(() => {
    const q = novoCargo.trim().toLowerCase();
    const base = q ? cargos.filter((c) => c.nome.toLowerCase().includes(q)) : [...cargos];
    return base.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [cargos, novoCargo]);

  const criarCargo = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const nome = novoCargo.trim();
      if (!nome) throw new Error("Informe o nome do cargo");
      const existe = cargos.some((c) => c.nome.toLowerCase() === nome.toLowerCase());
      if (existe) throw new Error("Já existe um cargo com esse nome");
      const tbl = supabase.from("cargos" as never) as any;
      const { error } = await tbl.insert({ empresa_id: empresa.id, nome });
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate"))
          throw new Error("Já existe um cargo com esse nome");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cargo criado");
      setNovoCargo("");
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renomearCargo = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const novo = nome.trim();
      if (!novo) throw new Error("Informe o nome do cargo");
      const tbl = supabase.from("cargos" as never) as any;
      const { error } = await tbl.update({ nome: novo }).eq("id", id);
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate"))
          throw new Error("Já existe um cargo com esse nome");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cargo atualizado");
      setCargoEditId(null);
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirCargo = useMutation({
    mutationFn: async (id: string) => {
      const tbl = supabase.from("cargos" as never) as any;
      const { error } = await tbl.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo excluído");
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = () => {
    setEditing(null);
    setForm(formInicial());
  };

  const openEdit = (c: Colab) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      cpf: c.cpf ?? "",
      cargo: c.cargo ?? "",
      email: c.email ?? "",
      telefone: (c.telefone ?? "").split(" / ").filter(Boolean).join("; "),
      salario_base: String(c.salario_base ?? 0),
      data_admissao: c.data_admissao ?? "",
      data_demissao: c.data_demissao ?? "",
      status: c.status,
      pix: c.pix ?? "",
      banco: c.banco ?? "",
      agencia: c.agencia ?? "",
      conta: c.conta ?? "",
      observacoes: c.observacoes ?? "",
      cnh_numero: c.cnh_numero ?? "",
      cnh_categoria: c.cnh_categoria ?? "",
      cnh_validade: c.cnh_validade ?? "",
      toxico_exame: c.toxico_exame ?? "",
      toxico_validade: c.toxico_exame ? soma30meses(c.toxico_exame) : "",
      data_nascimento: (c as any).data_nascimento ?? "",
      logradouro: (c as any).logradouro ?? "",
      numero: (c as any).numero ?? "",
      complemento: (c as any).complemento ?? "",
      bairro: (c as any).bairro ?? "",
      cidade: (c as any).cidade ?? "",
      uf: (c as any).uf ?? "",
      cep: (c as any).cep ?? "",
      optante_vt: c.optante_vt ?? false,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      validarForm(form);
      if (form.cpf) {
        const tbl2 = supabase.from("colaboradores" as never) as any;
        const q = tbl2
          .select("id")
          .eq("empresa_id", empresa.id)
          .eq("cpf", form.cpf.trim())
          .limit(1);
        const { data: existente } = await (editing ? q.neq("id", editing.id) : q);
        if (existente && existente.length > 0) {
          throw new Error("Já existe um colaborador com esse CPF nesta empresa");
        }
      }
      const payload: any = {
        empresa_id: empresa.id,
        nome: form.nome.trim().toUpperCase(),
        cpf: form.cpf || null,
        cargo: form.cargo.trim() || null,
        email: form.email || null,
        telefone:
          form.telefone
            .split(";")
            .map((t) => t.trim())
            .filter(Boolean)
            .join(" / ") || null,
        salario_base: Number(form.salario_base) || 0,
        data_admissao: form.data_admissao || null,
        data_demissao: form.data_demissao || null,
        status: form.status,
        pix: form.pix || null,
        banco: form.banco || null,
        agencia: form.agencia || null,
        conta: form.conta || null,
        observacoes: form.observacoes || null,
        cnh_numero: form.cnh_numero.trim() || null,
        cnh_categoria: form.cnh_categoria.trim() || null,
        cnh_validade: form.cnh_validade || null,
        toxico_exame: form.toxico_exame || null,
        optante_vt: form.optante_vt,
        data_nascimento: form.data_nascimento || null,
        logradouro: form.logradouro.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        uf: form.uf || null,
        cep: form.cep.replace(/\D/g, "") || null,
      };
      const semNovas = (p: any) => {
        const c = { ...p };
        for (const k of COLS_NOVAS) delete c[k];
        return c;
      };
      const gravar = async (p: any) => {
        const tbl = supabase.from("colaboradores" as never) as any;
        if (editing) return tbl.update(p).eq("id", editing.id);
        return tbl.insert(p);
      };
      let { error } = await gravar(payload);
      if (error && /data_nascimento|logradouro|complemento|column|PGRST204/i.test(error.message ?? "")) {
        // Migration ainda não aplicada no banco: salva sem os campos novos
        cacheColabNovos = false;
        ({ error } = await gravar(semNovas(payload)));
        if (!error)
          toast.warning(
            "Salvo sem nascimento/endereço — aplique a migration 20260929140000 no Supabase e recarregue",
          );
      }
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Colaborador atualizado" : "Colaborador cadastrado");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("colaboradores" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador excluído");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Colaboradores"
        description="Cadastro de funcionários, cargos e dados de pagamento."
        actions={
          <div className="flex gap-2">
            <Dialog open={cargosOpen} onOpenChange={setCargosOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Cargos
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Cargos</DialogTitle>
                </DialogHeader>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label>Novo cargo</Label>
                    <Input
                      placeholder="Digite para filtrar ou criar"
                      value={novoCargo}
                      onChange={(e) => setNovoCargo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && novoCargo.trim()) {
                          e.preventDefault();
                          criarCargo.mutate();
                        }
                      }}
                    />
                  </div>
                  <Button onClick={() => criarCargo.mutate()} disabled={criarCargo.isPending}>
                    {criarCargo.isPending ? "Criando…" : "Criar"}
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  {!cargosFiltrados.length && !novoCargo.trim() ? (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum cargo cadastrado.</p>
                  ) : (
                    <ul className="divide-y text-sm">
                      {cargosFiltrados.map((c) => {
                        const usos = usoCargo(c.nome);
                        const emEdicao = cargoEditId === c.id;
                        return (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                          >
                            {emEdicao ? (
                              <form
                                className="flex flex-1 items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  renomearCargo.mutate({ id: c.id, nome: cargoEditNome });
                                }}
                              >
                                <Input
                                  autoFocus
                                  value={cargoEditNome}
                                  onChange={(e) => setCargoEditNome(e.target.value)}
                                  onBlur={() => setCargoEditId(null)}
                                />
                                <Button type="submit" size="sm" disabled={renomearCargo.isPending}>
                                  Salvar
                                </Button>
                              </form>
                            ) : (
                              <>
                                <span>
                                  {c.nome}
                                  {usos > 0 && (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {usos} funcionário{usos > 1 ? "s" : ""}
                                    </span>
                                  )}
                                </span>
                                <span className="flex shrink-0 gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Renomear"
                                    onClick={() => {
                                      setCargoEditId(c.id);
                                      setCargoEditNome(c.nome);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Excluir"
                                    title={
                                      usos > 0
                                        ? "Vinculado a funcionário(s) — não pode ser excluído"
                                        : "Excluir"
                                    }
                                    disabled={usos > 0}
                                    onClick={() => excluirCargo.mutate(c.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </span>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Crie, renomeie e exclua qualquer cargo. Só não é possível excluir um cargo
                  vinculado ao cadastro de algum funcionário. Viagens consideram motoristas todos os
                  colaboradores com cargo contendo "Motorista".
                </p>
              </DialogContent>
            </Dialog>
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) reset();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Novo colaborador
                </Button>
              </DialogTrigger>
              <DialogContent className="flex flex-col">
                <DialogHeader className="shrink-0">
                  <div className="flex items-center justify-between gap-2 pr-8">
                    <DialogTitle>
                      <span className="border-l-4 border-pink-500 pl-3">
                        {editing ? "Editar colaborador" : "Novo colaborador"}
                      </span>
                    </DialogTitle>
                    <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-muted">
                      <FileUp className="h-3.5 w-3.5" /> Importar PDF da CNH
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) importarCnhPdf(e.target.files[0]);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto p-1">
                  <div className="border rounded bg-background overflow-hidden [&_input]:h-8 [&_button]:h-8">
                    <div className="p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
                        <div className="space-y-1 md:col-span-4">
                          <Label>Nome *</Label>
                          <Input value={form.nome} onChange={(e) => set("nome", e.target.value.toUpperCase())} className="uppercase" />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>CPF *</Label>
                          <Input
                            placeholder="000.000.000-00"
                            value={form.cpf}
                            onChange={(e) => set("cpf", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Data de nascimento</Label>
                          <DateInput
                            className="w-full"
                            value={form.data_nascimento}
                            onChange={(v) => set("data_nascimento", v)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Telefone(s) *</Label>
                          <Input
                            placeholder="(00) 00000-0000; (00) 00000-0000"
                            value={form.telefone}
                            onChange={(e) => set("telefone", mascaraTelefones(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>E-mail</Label>
                          <Input
                            type="email"
                            value={form.email}
                            onChange={(e) => set("email", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-primary/8 text-primary/80 border-y border-primary/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                      Endereço
                    </div>
                    <div className="p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
                        <div className="space-y-1 md:col-span-3">
                          <Label>Rua / Av.</Label>
                          <Input
                            value={form.logradouro}
                            onChange={(e) => set("logradouro", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-1">
                          <Label>Número</Label>
                          <Input
                            value={form.numero}
                            onChange={(e) => set("numero", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Complemento</Label>
                          <Input
                            value={form.complemento}
                            onChange={(e) => set("complemento", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Bairro</Label>
                          <Input
                            value={form.bairro}
                            onChange={(e) => set("bairro", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Cidade</Label>
                          <div className="relative">
                            <Input
                              placeholder="Digite para buscar"
                              value={form.cidade}
                              onChange={(e) => set("cidade", e.target.value)}
                              onFocus={() => setCidadeFoco(true)}
                              onBlur={() => setTimeout(() => setCidadeFoco(false), 200)}
                              autoComplete="off"
                            />
                            {cidadeFoco && cidadeSugestoes.length > 0 && (
                              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                                {cidadeSugestoes.map((m) => (
                                  <button
                                    type="button"
                                    key={m.uf + m.nome}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      set("cidade", m.nome);
                                      if (m.uf) set("uf", m.uf);
                                      setCidadeFoco(false);
                                    }}
                                  >
                                    {m.nome} — {m.uf}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 md:col-span-1">
                          <Label>UF</Label>
                          <Select
                            value={form.uf || undefined}
                            onValueChange={(v) => set("uf", v === "__limpar" ? "" : v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="UF" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__limpar">Limpar</SelectItem>
                              {UFS.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 md:col-span-1">
                          <Label>CEP</Label>
                          <Input
                            placeholder="00000-000"
                            value={form.cep}
                            onChange={(e) =>
                              set(
                                "cep",
                                e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 8)
                                  .replace(/(\d{5})(\d)/, "$1-$2"),
                              )
                            }
                            onBlur={() => buscarCep()}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
                        <div className="space-y-1 md:col-span-1">
                          <Label>ID</Label>
                          <Input value={editing ? String(editing.codigo ?? "") : "Auto"} readOnly title="Código do funcionário por ordem de cadastro" />
                        </div>
                        <div className="space-y-1 md:col-span-3">
                          <Label>Cargo *</Label>
                          <div className="relative">
                            <Input
                              placeholder="Digite ou selecione o cargo"
                              value={form.cargo}
                              onChange={(e) => set("cargo", e.target.value)}
                              onFocus={() => setCargoFoco(true)}
                              onBlur={() => setTimeout(() => setCargoFoco(false), 200)}
                              autoComplete="off"
                            />
                            {cargoFoco && cargoSugestoes.length > 0 && (
                              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                                {cargoSugestoes.map((nome) => (
                                  <button
                                    type="button"
                                    key={nome}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      set("cargo", nome);
                                      setCargoFoco(false);
                                    }}
                                  >
                                    {nome}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Status</Label>
                          <Select value={form.status} onValueChange={(v) => set("status", v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS).map(([k, v]) => (
                                <SelectItem key={k} value={k}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Data de admissão *</Label>
                          <DateInput
                            className="w-full"
                            value={form.data_admissao}
                            onChange={(v) => set("data_admissao", v)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Data de demissão</Label>
                          <DateInput
                            className="w-full"
                            value={form.data_demissao}
                            onChange={(v) => set("data_demissao", v)}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label>Salário base</Label>
                          <MoneyInput
                            value={form.salario_base}
                            onChange={(v) => set("salario_base", v)}
                          />
                          <label className="flex items-center gap-1.5 text-xs pt-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.optante_vt}
                              onChange={(e) => set("optante_vt", e.target.checked)}
                            />
                            Vale-transporte (6%)
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="bg-primary/8 text-primary/80 border-y border-primary/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                      CNH
                    </div>
                    <div className="p-2 space-y-2">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        <div className="space-y-1">
                          <Label>
                            Nº da CNH {form.cargo.toLowerCase().includes("motorist") ? "*" : ""}
                          </Label>
                          <Input
                            value={form.cnh_numero}
                            onChange={(e) => set("cnh_numero", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>
                            Categoria {form.cargo.toLowerCase().includes("motorist") ? "*" : ""}
                          </Label>
                          <Select
                            value={form.cnh_categoria || ""}
                            onValueChange={(v) => set("cnh_categoria", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {["A", "B", "AB", "C", "D", "E", "AC", "AD", "AE"].map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Validade</Label>
                          <DateInput
                            value={form.cnh_validade}
                            onChange={(v) => set("cnh_validade", v)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>
                            Último exame toxicológico{" "}
                            {form.cargo.toLowerCase().includes("motorist") ? "*" : ""}
                          </Label>
                          <Input
                            type="date"
                            value={form.toxico_exame}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                toxico_exame: e.target.value,
                                toxico_validade: e.target.value ? soma30meses(e.target.value) : "",
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Validade do toxicológico</Label>
                          <Input
                            value={form.toxico_validade ? dateBR(form.toxico_validade) : ""}
                            readOnly
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {form.toxico_exame
                              ? "2 anos e 6 meses após o exame (CTB art. 148-A)"
                              : form.cargo.toLowerCase().includes("motorist")
                                ? "Obrigatório para motoristas de categoria C/D/E"
                                : "Exame obrigatório apenas para categorias C/D/E"}
                          </p>
                        </div>
                      </div>
                      {avisoToxico(form.toxico_validade) && (
                        <p className="mt-2 text-xs text-warning-foreground">
                          ⚠ {avisoToxico(form.toxico_validade)}
                        </p>
                      )}
                    </div>
                    <div className="bg-primary/8 text-primary/80 border-y border-primary/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                      Dados da conta
                    </div>
                    <div className="p-2">
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                          <Label>PIX</Label>
                          <Input value={form.pix} onChange={(e) => set("pix", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Banco</Label>
                          <Input value={form.banco} onChange={(e) => set("banco", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Agência</Label>
                          <Input
                            value={form.agencia}
                            onChange={(e) => set("agencia", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Conta</Label>
                          <Input value={form.conta} onChange={(e) => set("conta", e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <div className="bg-primary/8 text-primary/80 border-y border-primary/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                      Adicionais
                    </div>
                    <div className="p-2 space-y-2">
                      <div className="space-y-1">
                        <Label>Observações</Label>
                        <Textarea
                          rows={2}
                          value={form.observacoes}
                          onChange={(e) => set("observacoes", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter className="shrink-0 border-t pt-3">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="overflow-hidden border-2 border-primary/20 shadow-panel">
        <div className="bg-primary text-primary-foreground px-3 py-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Colaboradores</h3>
          <span className="text-xs opacity-80">Qtde: {colabs?.length ?? 0}</span>
        </div>
        <div className="bg-primary/8 text-primary/80 border-b border-primary/20 px-3 py-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide">
            Listagem de colaboradores
          </span>
          <span className="text-xs">
            Página {paginaAtual} de {totalPaginas}
          </span>
        </div>
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !colabs || colabs.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum colaborador ainda"
            description="Cadastre o primeiro colaborador."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => alternarOrdem("codigo")} title="Ordenar por ID">ID{setaOrdem("codigo")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => alternarOrdem("nome")} title="Ordenar por nome">Nome{setaOrdem("nome")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => alternarOrdem("cargo")} title="Ordenar por cargo">Cargo{setaOrdem("cargo")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => alternarOrdem("status")} title="Ordenar por status">Status{setaOrdem("status")}</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => alternarOrdem("data_admissao")} title="Ordenar por admissão">Admissão{setaOrdem("data_admissao")}</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => alternarOrdem("salario_base")} title="Ordenar por salário">Salário{setaOrdem("salario_base")}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colabsVisiveis.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.codigo ?? "—"}</TableCell>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>{c.cargo ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className={
                          "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (c.status === "ativo"
                            ? "bg-primary/15 text-primary"
                            : c.status === "suspenso"
                              ? "bg-amber-500/15 text-amber-700"
                              : "bg-muted text-muted-foreground")
                        }
                      >
                        {STATUS[c.status] ?? c.status}
                      </span>
                    </TableCell>
                    <TableCell>{c.data_admissao ? dateBR(c.data_admissao) : "—"}</TableCell>
                    <TableCell className="text-right text-tabular">
                      {brl(c.salario_base ?? 0)}
                    </TableCell>
                    <TableCell>
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
                              <AlertDialogDescription>
                                As folhas vinculadas também serão removidas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(c.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                Mostrando {(paginaAtual - 1) * pageSize + 1}–
                {Math.min(paginaAtual * pageSize, colabs?.length ?? 0)} de {colabs?.length ?? 0}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Página anterior"
                  disabled={paginaAtual === 1}
                  onClick={() => setPagina((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs">
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Próxima página"
                  disabled={paginaAtual === totalPaginas}
                  onClick={() => setPagina((value) => Math.min(totalPaginas, value + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
