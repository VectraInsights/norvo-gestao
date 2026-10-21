import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Package, Plus, Trash2, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchField } from "@/components/erp/search-field";
import { supabase } from "@/integrations/supabase/client";
import {
  OPCOES_TP_CARGA,
  garantirPadraoNcmFiscal,
  normalizaNcm,
  rotuloTpCarga,
  tipoAnttDoTpCarga,
  tpCargaDoTipoAntt,
} from "@/lib/ncm-fiscal";

type Linha = {
  id: string;
  ncm: string | null;
  x_prod: string;
  tp_carga: string | null;
  origem: string | null;
};

const ORIGEM_LABEL: Record<string, string> = {
  manual: "Manual",
  nf: "Importado de NF-e",
};

/**
 * Cadastro de NCM do modulo Fiscal (CT-e / MDF-e).
 *
 * Separado do cadastro de produtos do Estoque (`produtos.ncm`) e da referencia
 * global oficial (`ncm`): aqui fica o produto predominante da carga, com o NCM e o
 * tipo de carga ANTT que alimentam o <prodPred> do MDF-e e o <proPred> do CT-e.
 */
export function NcmFiscalTab({ empresaId }: { empresaId: string }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [ncm, setNcm] = useState("");
  const [xProd, setXProd] = useState("");
  const [tipo, setTipo] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNcm, setEditNcm] = useState("");
  const [editXProd, setEditXProd] = useState("");
  const [editTipo, setEditTipo] = useState<string>("");
  const [excluindo, setExcluindo] = useState<Linha | null>(null);

  // Garante o item padrao "CAIXAS" (produto predominante das cargas).
  useEffect(() => {
    void garantirPadraoNcmFiscal(empresaId).then(() => {
      qc.invalidateQueries({ queryKey: ["ncm-fiscal", empresaId] });
    });
  }, [empresaId, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ["ncm-fiscal", empresaId],
    queryFn: async () => {
      const { data: d, error } = await supabase
        .from("ncm_fiscal" as never)
        .select("id, ncm, x_prod, tp_carga, origem")
        .eq("empresa_id", empresaId)
        .order("x_prod");
      if (error) return [] as Linha[];
      return ((d ?? []) as unknown as Linha[]) ?? [];
    },
  });

  // Descricao oficial do NCM (tabela `ncm` = Classif/Siscomex) para conferir o codigo.
  const codigoBusca = normalizaNcm(ncm);
  const { data: oficial } = useQuery({
    queryKey: ["ncm-oficial", codigoBusca],
    enabled: codigoBusca.length === 8,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: d } = await supabase
        .from("ncm" as never)
        .select("codigo, descricao")
        .eq("codigo", codigoBusca)
        .maybeSingle();
      return (d as unknown as { codigo: string; descricao: string } | null) ?? null;
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = (data ?? []) as Linha[];
    if (!q) return lista;
    return lista.filter(
      (r) =>
        (r.x_prod || "").toLowerCase().includes(q) ||
        (r.ncm || "").includes(q) ||
        rotuloTpCarga(r.tp_carga).toLowerCase().includes(q),
    );
  }, [data, busca]);

  const reset = () => {
    setNcm("");
    setXProd("");
    setTipo("");
  };

  const add = async () => {
    if (!xProd.trim()) return toast.error("Informe o nome do produto");
    const cod = normalizaNcm(ncm);
    if (cod && cod.length !== 8) return toast.error("NCM deve ter 8 dígitos");
    const { error } = await supabase.from("ncm_fiscal" as never).insert({
      empresa_id: empresaId,
      ncm: cod || null,
      x_prod: xProd.trim().slice(0, 120),
      tp_carga: tipo ? tpCargaDoTipoAntt(tipo) : null,
      origem: "manual",
    } as never);
    if (error) return toast.error(error.message);
    reset();
    qc.invalidateQueries({ queryKey: ["ncm-fiscal"] });
    toast.success("Item cadastrado");
  };

  const startEdit = (r: Linha) => {
    setEditingId(r.id);
    setEditNcm(r.ncm || "");
    setEditXProd(r.x_prod || "");
    setEditTipo(tipoAnttDoTpCarga(r.tp_carga) ?? "");
  };

  const saveEdit = async (id: string) => {
    if (!editXProd.trim()) return toast.error("Informe o nome do produto");
    const cod = normalizaNcm(editNcm);
    if (cod && cod.length !== 8) return toast.error("NCM deve ter 8 dígitos");
    const { error } = await supabase
      .from("ncm_fiscal" as never)
      .update({
        ncm: cod || null,
        x_prod: editXProd.trim().slice(0, 120),
        tp_carga: editTipo ? tpCargaDoTipoAntt(editTipo) : null,
      } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["ncm-fiscal"] });
    toast.success("Item atualizado");
  };

  const doExcluir = async () => {
    if (!excluindo) return;
    const { error } = await supabase.from("ncm_fiscal" as never).delete().eq("id", excluindo.id);
    setExcluindo(null);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ncm-fiscal"] });
    toast.success("Item excluído");
  };

  const campos = (vNcm: string, setNcmFn: (v: string) => void) => (
    <div className="flex flex-col gap-1">
      <Input
        value={vNcm}
        onChange={(e) => setNcmFn(e.target.value.replace(/\D/g, "").slice(0, 8))}
        className="h-9 rounded-xl"
        aria-label="NCM"
      />
    </div>
  );

  return (
    <Card className="mt-4 rounded-2xl shadow-panel">
      <CardContent className="p-5 sm:p-6">
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Produtos predominantes da carga: alimentam o produto predominante do CT-e e o{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">prodPred</code> do MDF-e
          (tipo de carga + NCM). As NF-e importadas preenchem este cadastro sozinhas.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[140px_2fr_1fr_auto]">
          {campos(ncm, setNcm)}
          <Input
            value={xProd}
            onChange={(e) => setXProd(e.target.value)}
            className="h-10 rounded-xl"
            aria-label="Produto"
          />
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="h-10 rounded-xl" aria-label="Tipo de carga">
              <SelectValue placeholder="Tipo de carga" />
            </SelectTrigger>
            <SelectContent>
              {OPCOES_TP_CARGA.map((o) => (
                <SelectItem key={o.nome} value={o.nome}>
                  {o.codigo ? `${o.codigo} - ${o.nome}` : `${o.nome} (sem código no MDF-e)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={add}
            className="h-10 shrink-0 whitespace-nowrap rounded-xl px-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Adicionar
          </Button>
        </div>

        {codigoBusca.length === 8 && (
          <p className="mb-3 text-xs text-muted-foreground">
            {oficial
              ? `${oficial.codigo} — ${oficial.descricao}`
              : "Código não encontrado na tabela oficial do Classif (Gecex)."}
          </p>
        )}

        <div className="mb-3 flex items-center gap-2.5">
          <SearchField
            value={busca}
            onChange={setBusca}
            placeholder="Buscar por produto, NCM ou tipo de carga"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NCM</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo de carga</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  {busca
                    ? "Nenhum item encontrado."
                    : "Nenhum produto cadastrado. Importe uma NF-e ou cadastre manualmente."}
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((r) =>
                editingId === r.id ? (
                  <TableRow key={r.id}>
                    <TableCell>{campos(editNcm, setEditNcm)}</TableCell>
                    <TableCell>
                      <Input
                        value={editXProd}
                        onChange={(e) => setEditXProd(e.target.value)}
                        className="h-9 rounded-xl"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={editTipo} onValueChange={setEditTipo}>
                        <SelectTrigger className="h-9 rounded-xl">
                          <SelectValue placeholder="Tipo de carga" />
                        </SelectTrigger>
                        <SelectContent>
                          {OPCOES_TP_CARGA.map((o) => (
                            <SelectItem key={o.nome} value={o.nome}>
                              {o.codigo ? `${o.codigo} - ${o.nome}` : `${o.nome} (sem código no MDF-e)`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ORIGEM_LABEL[r.origem || "manual"] ?? r.origem}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => saveEdit(r.id)}
                        aria-label="Salvar"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-muted-foreground">{r.ncm || "—"}</TableCell>
                    <TableCell className="font-medium">{r.x_prod}</TableCell>
                    <TableCell className="text-muted-foreground">{rotuloTpCarga(r.tp_carga)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ORIGEM_LABEL[r.origem || "manual"] ?? r.origem}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => startEdit(r)}
                        aria-label="Editar"
                      >
                        <Package className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                        onClick={() => setExcluindo(r)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.x_prod} sai do cadastro de NCM fiscal. Documentos já emitidos não
              são alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doExcluir}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
