import { useRef } from "react";
import * as XLSX from "xlsx-js-style";
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
    const hoje = format(new Date(), "dd/MM/yyyy");
    const linhas: (string | number)[][] = [
      HEADERS,
      [hoje, hoje, 1500.5, "Venda pedido 123", categorias?.[0]?.nome ?? "Vendas", contatos?.[0]?.nome ?? "Cliente exemplo", "", "Receita (valor positivo)"],
      [hoje, hoje, -850, "Compra fornecedor X", categorias?.[0]?.nome ?? "Fornecedores", contatos?.[0]?.nome ?? "Fornecedor exemplo", "", "Despesa (valor negativo)"],
      [hoje, hoje, 2300, "Prestação de serviço", categorias?.[0]?.nome ?? "Serviços", "", "", ""],
      [hoje, hoje, -450.75, "Conta de energia", categorias?.[0]?.nome ?? "Utilidades", "", "12.345.678/0001-99", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    ws["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 34 }, { wch: 22 }, { wch: 26 }, { wch: 20 }, { wch: 34 }];
    ws["!rows"] = [{ hpt: 32 }];
    ws["!freeze"] = { xSplit: "0", ySplit: "1", topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

    const BORDER = { style: "thin", color: { rgb: "E5E7EB" } };
    const border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

    HEADERS.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      ws[ref].s = {
        font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "0F172A" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "0F172A" } },
          bottom: { style: "medium", color: { rgb: "F59E0B" } },
          left: { style: "thin", color: { rgb: "0F172A" } },
          right: { style: "thin", color: { rgb: "0F172A" } },
        },
      };
    });

    for (let r = 1; r < linhas.length; r++) {
      const zebra = r % 2 === 0 ? "F8FAFC" : "FFFFFF";
      const valorCel = linhas[r][2] as number;
      const receita = valorCel >= 0;
      for (let c = 0; c < HEADERS.length; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) ws[ref] = { t: "s", v: "" };
        const base: Record<string, unknown> = {
          font: { name: "Calibri", sz: 11, color: { rgb: "0F172A" } },
          fill: { patternType: "solid", fgColor: { rgb: zebra } },
          alignment: { vertical: "center", wrapText: true },
          border,
        };
        if (c === 0 || c === 1) {
          (base.alignment as Record<string, unknown>).horizontal = "center";
        }
        if (c === 2) {
          ws[ref].z = 'R$ #,##0.00;[Red]-R$ #,##0.00';
          (base.alignment as Record<string, unknown>).horizontal = "right";
          (base.font as Record<string, unknown>) = { name: "Calibri", sz: 11, bold: true, color: { rgb: receita ? "047857" : "B91C1C" } };
        }
        ws[ref].s = base;
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");

    const infoRows: string[][] = [
      ["Modelo de importação — Norvo"],
      [""],
      ["Como preencher"],
      ["1. Uma linha por lançamento, começando na linha 2 da aba Modelo."],
      ["2. Campos obrigatórios: Data competência, Data Vencimento, Valor, Descrição, Categoria."],
      ["3. Valor POSITIVO = Receita (a receber). Valor NEGATIVO = Despesa (a pagar)."],
      ["4. Datas sempre no formato dd/mm/aaaa."],
      ["5. Categoria e Cliente/Fornecedor devem existir previamente no sistema (mesmo nome). CNPJ/CPF é opcional."],
    ];
    const info = XLSX.utils.aoa_to_sheet(infoRows);
    info["!cols"] = [{ wch: 110 }];
    info["!rows"] = [{ hpt: 34 }, { hpt: 8 }, { hpt: 22 }];
    info["A1"].s = {
      font: { name: "Calibri", sz: 18, bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "0F172A" } },
      alignment: { horizontal: "left", vertical: "center", indent: 1 },
    };
    info["A3"].s = {
      font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "F59E0B" } },
      alignment: { horizontal: "left", vertical: "center" },
    };
    for (let r = 3; r < infoRows.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: 0 });
      info[ref].s = {
        font: { name: "Calibri", sz: 11, color: { rgb: "1F2937" } },
        alignment: { horizontal: "left", vertical: "center", wrapText: true },
      };
    }
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
        const dv = parseData(r["Data Vencimento (dd/mm/aaaa)"] ?? r["Data Vencimento"] ?? r["Data vencimento"] ?? r["Vencimento"]);
        const de = parseData(r["Data competência (dd/mm/aaaa)"] ?? r["Data competência"] ?? r["Competência"] ?? r["Data emissão"]);
        const nomeCat = String(r["Categoria"] ?? "").trim().toLowerCase();
        const faltando: string[] = [];
        if (!de) faltando.push("Data competência");
        if (!dv) faltando.push("Data Vencimento");
        if (valorRaw === 0) faltando.push("Valor");
        if (!descricao) faltando.push("Descrição");
        if (!nomeCat) faltando.push("Categoria");
        if (faltando.length) {
          erros.push(`Linha ${linha}: campo(s) obrigatório(s) ausente(s): ${faltando.join(", ")}`);
          return;
        }
        const catId = mCategorias.get(nomeCat);
        if (!catId) {
          erros.push(`Linha ${linha}: categoria "${r["Categoria"]}" não encontrada`);
          return;
        }
        const tipoLinha: "receber" | "pagar" = valorRaw >= 0 ? "receber" : "pagar";
        const valor = Math.abs(valorRaw);
        const nomeContato = String(r["Cliente/Fornecedor"] ?? r["Contato"] ?? "").trim().toLowerCase();
        inserts.push({
          empresa_id: empresaId,
          tipo: tipoLinha,
          descricao,
          valor,
          data_emissao: de!,
          data_vencimento: dv!,
          contato_id: nomeContato ? mContatos.get(nomeContato) ?? null : null,
          categoria_id: catId,
          conta_bancaria_id: null,
          documento: String(r["CNPJ/CPF"] ?? "").trim() || null,
          observacoes: String(r["Obs."] ?? r["Observações"] ?? "").trim() || null,
        });
      });

      if (erros.length) {
        toast.error(`Importação cancelada — ${erros.length} erro(s)`, { description: erros.slice(0, 5).join("\n") });
        return;
      }
      if (!inserts.length) {
        toast.error("Planilha vazia");
        return;
      }

      // Checagem de duplicidade: descrição + data_vencimento + valor
      const vencs = Array.from(new Set(inserts.map((i) => i.data_vencimento)));
      const { data: existentes } = await supabase
        .from("lancamentos_financeiros")
        .select("descricao,data_vencimento,valor")
        .eq("empresa_id", empresaId)
        .in("data_vencimento", vencs);
      const chave = (d: string, v: string, val: number) =>
        `${d.trim().toLowerCase()}|${v}|${Number(val).toFixed(2)}`;
      const existSet = new Set((existentes ?? []).map((e) => chave(e.descricao, e.data_vencimento, Number(e.valor))));
      const seenBatch = new Set<string>();
      const novos: Insert[] = [];
      const duplicados: string[] = [];
      inserts.forEach((ins) => {
        const k = chave(ins.descricao, ins.data_vencimento, ins.valor);
        if (existSet.has(k) || seenBatch.has(k)) {
          duplicados.push(`${ins.descricao} — ${format(new Date(ins.data_vencimento), "dd/MM/yyyy")} — R$ ${ins.valor.toFixed(2)}`);
          return;
        }
        seenBatch.add(k);
        novos.push(ins);
      });

      if (!novos.length) {
        toast.warning(`Nenhum lançamento importado — ${duplicados.length} duplicata(s) ignorada(s)`, {
          description: duplicados.slice(0, 5).join("\n"),
        });
        return;
      }

      const { error } = await supabase.from("lancamentos_financeiros").insert(novos);
      if (error) throw error;
      const nRec = novos.filter((x) => x.tipo === "receber").length;
      const nPag = novos.length - nRec;
      const msg = `Importado(s): ${nRec} receita(s), ${nPag} despesa(s)`;
      if (duplicados.length) {
        toast.success(msg, {
          description: `${duplicados.length} duplicata(s) ignorada(s):\n${duplicados.slice(0, 5).join("\n")}`,
        });
      } else {
        toast.success(msg);
      }
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
