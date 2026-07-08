import { useRef } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Download, Printer, Upload, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";

type Opt = { id: string; nome: string };
type Lanc = {
  descricao: string;
  valor: number;
  status: string;
  data_vencimento: string;
  contato: { nome: string } | null;
};

const HEADERS = [
  "Data competência (dd/mm/aaaa)",
  "Data Vencimento (dd/mm/aaaa)",
  "Valor",
  "Descrição",
  "Categoria",
  "Cliente/Fornecedor",
  "CNPJ/CPF",
  "Obs.",
];


function parseData(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && isValid(v)) return format(v, "yyyy-MM-dd");
  const s = String(v).trim();
  for (const fmt of ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd"]) {
    const d = parse(s, fmt, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return null;
}

function parseValor(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export function LancamentosToolbar({
  tipo,
  empresaId,
  lancamentos,
  contatos,
  categorias,
  contas,
  onImported,
}: {
  tipo: "receber" | "pagar";
  empresaId: string | undefined;
  lancamentos: Lanc[] | undefined;
  contatos: Opt[] | undefined;
  categorias: Opt[] | undefined;
  contas: Opt[] | undefined;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const label = tipo === "receber" ? "receitas" : "despesas";

  const baixarModelo = () => {
    const exemplo = [
      HEADERS,
      [
        format(new Date(), "dd/MM/yyyy"),
        format(new Date(), "dd/MM/yyyy"),
        1500.5,
        "Venda pedido 123",
        categorias?.[0]?.nome ?? "",
        contatos?.[0]?.nome ?? "",
        "",
        "Receita (valor positivo)",
      ],
      [
        format(new Date(), "dd/MM/yyyy"),
        format(new Date(), "dd/MM/yyyy"),
        -850,
        "Compra fornecedor X",
        categorias?.[0]?.nome ?? "",
        contatos?.[0]?.nome ?? "",
        "",
        "Despesa (valor negativo)",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(exemplo);
    ws["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 32 }, { wch: 20 }, { wch: 24 }, { wch: 18 }, { wch: 32 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    const info = XLSX.utils.aoa_to_sheet([
      ["Modelo de importação — despesas e receitas"],
      [],
      ["Preencha uma linha por lançamento a partir da linha 2 da aba Modelo."],
      ["Campos obrigatórios: Data Vencimento, Valor, Descrição."],
      ["Valor POSITIVO = Receita (a receber). Valor NEGATIVO = Despesa (a pagar)."],
      ["Datas no formato dd/mm/aaaa."],
      ["Categoria e Cliente/Fornecedor devem existir previamente no sistema (mesmo nome). CNPJ/CPF é opcional."],

    ]);
    XLSX.utils.book_append_sheet(wb, info, "Instruções");
    XLSX.writeFile(wb, `Modelo_despesas_receitas_norvo.xlsx`);
  };


  const exportar = () => {
    const rows = (lancamentos ?? []).map((l) => ({
      Descrição: l.descricao,
      Valor: l.valor,
      Vencimento: format(new Date(l.data_vencimento), "dd/MM/yyyy"),
      Contato: l.contato?.nome ?? "",
      Status: l.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo === "receber" ? "Receber" : "Pagar");
    XLSX.writeFile(wb, `${label}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const importar = async (file: File) => {
    if (!empresaId) { toast.error("Selecione uma empresa"); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames.find((n) => n.toLowerCase().includes("modelo")) ?? wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const byNome = (list: Opt[] | undefined) => new Map((list ?? []).map((o) => [o.nome.trim().toLowerCase(), o.id]));
      const mContatos = byNome(contatos);
      const mCategorias = byNome(categorias);
      const mContas = byNome(contas);

      type Insert = {
        empresa_id: string; tipo: "receber" | "pagar"; descricao: string; valor: number;
        data_emissao?: string; data_vencimento: string;
        contato_id: string | null; categoria_id: string | null; conta_bancaria_id: string | null;
        documento: string | null; observacoes: string | null;
      };
      const inserts: Insert[] = [];
      const erros: string[] = [];
      rows.forEach((r, i) => {
        const linha = i + 2;
        const descricao = String(r["Descrição"] ?? "").trim();
        const valorRaw = parseValor(r["Valor"]);
        const dv = parseData(r["Data vencimento (dd/mm/aaaa)"] ?? r["Vencimento"] ?? r["Data vencimento"]);
        const de = parseData(r["Data emissão (dd/mm/aaaa)"] ?? r["Emissão"] ?? r["Data emissão"]) ?? dv;
        if (!descricao || valorRaw === 0 || !dv) {
          erros.push(`Linha ${linha}: campos obrigatórios inválidos`);
          return;
        }
        const tipoLinha: "receber" | "pagar" = valorRaw >= 0 ? "receber" : "pagar";
        const valor = Math.abs(valorRaw);
        const nomeContato = String(r["Contato"] ?? "").trim().toLowerCase();
        const nomeCat = String(r["Categoria"] ?? "").trim().toLowerCase();
        const nomeConta = String(r["Conta financeira"] ?? r["Conta bancária"] ?? "").trim().toLowerCase();
        inserts.push({
          empresa_id: empresaId,
          tipo: tipoLinha,
          descricao,
          valor,
          data_emissao: de ?? undefined,
          data_vencimento: dv,
          contato_id: nomeContato ? mContatos.get(nomeContato) ?? null : null,
          categoria_id: nomeCat ? mCategorias.get(nomeCat) ?? null : null,
          conta_bancaria_id: nomeConta ? mContas.get(nomeConta) ?? null : null,
          documento: String(r["Documento/NF"] ?? r["Documento"] ?? "").trim() || null,
          observacoes: String(r["Observações"] ?? "").trim() || null,
        });
      });

      if (!inserts.length) {
        toast.error(erros[0] ?? "Planilha vazia");
        return;
      }
      const { error } = await supabase.from("lancamentos_financeiros").insert(inserts);
      if (error) throw error;
      const nRec = inserts.filter((x) => x.tipo === "receber").length;
      const nPag = inserts.length - nRec;
      toast.success(`Importado(s): ${nRec} receita(s), ${nPag} despesa(s)${erros.length ? ` — ${erros.length} linha(s) ignorada(s)` : ""}`);
      onImported();
    } catch (e) {
      toast.error((e as Error).message);

    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <Button size="sm" variant="outline" onClick={baixarModelo}>
        <FileSpreadsheet className="mr-1 h-4 w-4" />Modelo de planilha
      </Button>
      <Button size="sm" variant="outline" onClick={exportar}>
        <Download className="mr-1 h-4 w-4" />Exportar
      </Button>
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <Printer className="mr-1 h-4 w-4" />Imprimir
      </Button>
      <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload className="mr-1 h-4 w-4" />Importar planilha
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); }}
      />
    </div>
  );
}
