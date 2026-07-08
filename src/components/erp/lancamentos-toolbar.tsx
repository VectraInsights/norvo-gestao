import { useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Download, Printer, Upload, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

type Insert = {
  empresa_id: string; tipo: "receber" | "pagar"; descricao: string; valor: number;
  data_emissao?: string; data_vencimento: string;
  contato_id: string | null; categoria_id: string | null; conta_bancaria_id: string | null;
  documento: string | null; observacoes: string | null;
};

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
  const [pending, setPending] = useState<{ inserts: Insert[]; criados: { categorias: number; contatos: number } } | null>(null);
  const [contaSel, setContaSel] = useState<string>("__none");
  const [saving, setSaving] = useState(false);
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
      ["5. Categorias e Clientes/Fornecedores inexistentes serão criados automaticamente."],
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

      type Parsed = {
        linha: number;
        descricao: string; valor: number; tipoLinha: "receber" | "pagar";
        de: string; dv: string;
        catNome: string; contatoNome: string; documento: string | null; observacoes: string | null;
      };
      const parsed: Parsed[] = [];
      const erros: string[] = [];
      rows.forEach((r, i) => {
        const linha = i + 2;
        const descricao = String(r["Descrição"] ?? "").trim();
        const valorRaw = parseValor(r["Valor"]);
        const dv = parseData(r["Data Vencimento (dd/mm/aaaa)"] ?? r["Data Vencimento"] ?? r["Data vencimento"] ?? r["Vencimento"]);
        const de = parseData(r["Data competência (dd/mm/aaaa)"] ?? r["Data competência"] ?? r["Competência"] ?? r["Data emissão"]);
        const catNome = String(r["Categoria"] ?? "").trim();
        const faltando: string[] = [];
        if (!de) faltando.push("Data competência");
        if (!dv) faltando.push("Data Vencimento");
        if (valorRaw === 0) faltando.push("Valor");
        if (!descricao) faltando.push("Descrição");
        if (!catNome) faltando.push("Categoria");
        if (faltando.length) {
          erros.push(`Linha ${linha}: campo(s) obrigatório(s) ausente(s): ${faltando.join(", ")}`);
          return;
        }
        parsed.push({
          linha,
          descricao, valor: Math.abs(valorRaw),
          tipoLinha: valorRaw >= 0 ? "receber" : "pagar",
          de: de!, dv: dv!,
          catNome,
          contatoNome: String(r["Cliente/Fornecedor"] ?? r["Contato"] ?? "").trim(),
          documento: String(r["CNPJ/CPF"] ?? "").trim() || null,
          observacoes: String(r["Obs."] ?? r["Observações"] ?? "").trim() || null,
        });
      });

      if (erros.length) {
        toast.error(`Importação cancelada — ${erros.length} erro(s)`, { description: erros.slice(0, 5).join("\n") });
        return;
      }
      if (!parsed.length) { toast.error("Planilha vazia"); return; }

      // Maps existentes
      const mCategorias = new Map((categorias ?? []).map((o) => [o.nome.trim().toLowerCase(), o.id]));
      const mContatos = new Map((contatos ?? []).map((o) => [o.nome.trim().toLowerCase(), o.id]));

      // Criar categorias faltantes (por nome+tipo)
      const novasCats = new Map<string, { nome: string; tipo: "receber" | "pagar" }>();
      parsed.forEach((p) => {
        const key = p.catNome.toLowerCase();
        if (!mCategorias.has(key)) novasCats.set(key, { nome: p.catNome, tipo: p.tipoLinha });
      });
      let criadasCats = 0;
      if (novasCats.size) {
        const payload = Array.from(novasCats.values()).map((c) => ({
          empresa_id: empresaId, nome: c.nome, tipo: c.tipo, parent_id: null,
        }));
        const { data, error } = await supabase.from("categorias_financeiras").insert(payload).select("id,nome");
        if (error) throw error;
        (data ?? []).forEach((c) => mCategorias.set(c.nome.trim().toLowerCase(), c.id));
        criadasCats = data?.length ?? 0;
      }

      // Criar contatos faltantes
      const novosContatos = new Map<string, { nome: string; tipo: "cliente" | "fornecedor"; documento: string | null }>();
      parsed.forEach((p) => {
        if (!p.contatoNome) return;
        const key = p.contatoNome.toLowerCase();
        if (!mContatos.has(key)) {
          novosContatos.set(key, {
            nome: p.contatoNome,
            tipo: p.tipoLinha === "receber" ? "cliente" : "fornecedor",
            documento: p.documento,
          });
        }
      });
      let criadosCtt = 0;
      if (novosContatos.size) {
        const payload = Array.from(novosContatos.values()).map((c) => ({
          empresa_id: empresaId, nome: c.nome, tipo: c.tipo, documento: c.documento,
        }));
        const { data, error } = await supabase.from("contatos").insert(payload).select("id,nome");
        if (error) throw error;
        (data ?? []).forEach((c) => mContatos.set(c.nome.trim().toLowerCase(), c.id));
        criadosCtt = data?.length ?? 0;
      }

      const inserts: Insert[] = parsed.map((p) => ({
        empresa_id: empresaId,
        tipo: p.tipoLinha,
        descricao: p.descricao,
        valor: p.valor,
        data_emissao: p.de,
        data_vencimento: p.dv,
        contato_id: p.contatoNome ? mContatos.get(p.contatoNome.toLowerCase()) ?? null : null,
        categoria_id: mCategorias.get(p.catNome.toLowerCase()) ?? null,
        conta_bancaria_id: null,
        documento: p.documento,
        observacoes: p.observacoes,
      }));

      setContaSel("__none");
      setPending({ inserts, criados: { categorias: criadasCats, contatos: criadosCtt } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmarImportacao = async () => {
    if (!pending || !empresaId) return;
    setSaving(true);
    try {
      const contaId = contaSel === "__none" ? null : contaSel;
      const inserts = pending.inserts.map((i) => ({ ...i, conta_bancaria_id: contaId }));

      // Dedup contra existentes
      const vencs = Array.from(new Set(inserts.map((i) => i.data_vencimento)));
      const { data: existentes } = await supabase
        .from("lancamentos_financeiros")
        .select("descricao,data_vencimento,valor")
        .eq("empresa_id", empresaId)
        .in("data_vencimento", vencs);
      const chave = (d: string, v: string, val: number) =>
        `${d.trim().toLowerCase()}|${v}|${Number(val).toFixed(2)}`;
      const existSet = new Set((existentes ?? []).map((e) => chave(e.descricao, e.data_vencimento, Number(e.valor))));
      const seen = new Set<string>();
      const novos: Insert[] = [];
      const duplicados: string[] = [];
      inserts.forEach((ins) => {
        const k = chave(ins.descricao, ins.data_vencimento, ins.valor);
        if (existSet.has(k) || seen.has(k)) {
          duplicados.push(`${ins.descricao} — ${format(new Date(ins.data_vencimento), "dd/MM/yyyy")} — R$ ${ins.valor.toFixed(2)}`);
          return;
        }
        seen.add(k);
        novos.push(ins);
      });

      const criadosMsg = `${pending.criados.categorias} categoria(s) e ${pending.criados.contatos} contato(s) criado(s) automaticamente`;

      if (!novos.length) {
        toast.warning(`Nenhum lançamento importado — ${duplicados.length} duplicata(s) ignorada(s)`, {
          description: `${criadosMsg}\n${duplicados.slice(0, 5).join("\n")}`,
        });
        setPending(null);
        onImported();
        return;
      }

      const { error } = await supabase.from("lancamentos_financeiros").insert(novos);
      if (error) throw error;
      const nRec = novos.filter((x) => x.tipo === "receber").length;
      const nPag = novos.length - nRec;
      toast.success(`Importado(s): ${nRec} receita(s), ${nPag} despesa(s)`, {
        description: duplicados.length
          ? `${criadosMsg}\n${duplicados.length} duplicata(s) ignorada(s):\n${duplicados.slice(0, 5).join("\n")}`
          : criadosMsg,
      });
      setPending(null);
      onImported();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
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

      <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !saving) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular conta financeira</DialogTitle>
            <DialogDescription>
              {pending ? (
                <>
                  {pending.inserts.length} lançamento(s) prontos para importar.
                  {(pending.criados.categorias > 0 || pending.criados.contatos > 0) && (
                    <> Criados automaticamente: {pending.criados.categorias} categoria(s), {pending.criados.contatos} contato(s).</>
                  )}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Conta financeira (opcional)</label>
            <Select value={contaSel} onValueChange={setContaSel}>
              <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem conta vinculada</SelectItem>
                {(contas ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirmarImportacao} disabled={saving}>
              {saving ? "Importando..." : "Confirmar importação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
