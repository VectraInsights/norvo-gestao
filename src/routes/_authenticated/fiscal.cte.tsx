import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Plus, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fiscal/cte")({
  component: CtePage,
  head: () => ({ meta: [{ title: "CT-e — Norvo" }] }),
});

type CteDoc = { id: string; numero: string | null; serie: string | null; status: string; valor_servico: number | null; chave_acesso: string | null; created_at: string };

function CtePage() {
  const { data: empresa } = useEmpresaAtual();
  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-documentos", empresa?.id],
    queryFn: async (): Promise<CteDoc[]> => {
      const { data, error } = await supabase.from("cte_documentos" as any).select("id,numero,serie,status,valor_servico,chave_acesso,created_at").eq("empresa_id", empresa!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as CteDoc[];
    },
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader eyebrow="Fiscal" title="CT-e" description="Conhecimento de Transporte Eletrônico (modelo 57) — emissão e gestão. Fase 1: estrutura de dados e rascunhos. SEFAZ (assinatura/mTLS) na fase 2." actions={<Button size="sm" disabled title="Fase 2"><Plus className="mr-1 h-4 w-4" /> Novo CT-e</Button>} />
      <Card className="p-4 bg-amber-500/10 border-amber-500/30 text-sm">
        <strong>Fase 1 — estrutura:</strong> tabelas <code>cte_documentos</code>/<code>mdf_documentos</code> + libs <code>sefaz-cte.ts</code>/<code>sefaz-mdf.ts</code> + proxy stubs. Emissão real (XML 4.00, assinatura W3C, SOAP mTLS) e cancelamento/encerramento entram na fase 2 (~2–3 semanas, endpoints por UF, testes hom. SEFAZ).
      </Card>
      {isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> : !docs?.length ? (
        <EmptyState icon={Truck} title="Nenhum CT-e" description="Os conhecimentos emitidos aparecerão aqui. Na fase 1 você já pode criar rascunhos via Supabase; a emissão SEFAZ será habilitada na fase 2." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Série</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Chave</TableHead></TableRow></TableHeader>
            <TableBody>{docs.map(d => (
              <TableRow key={d.id}><TableCell className="font-mono">{d.numero ?? "—"}</TableCell><TableCell>{d.serie ?? "—"}</TableCell><TableCell><Badge variant="secondary">{d.status}</Badge></TableCell><TableCell className="text-right">{brl(Number(d.valor_servico ?? 0))}</TableCell><TableCell className="font-mono text-xs truncate max-w-[220px]">{d.chave_acesso ?? "—"}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </Card>
      )}
      <Card className="p-4 text-xs text-muted-foreground">
        <div className="flex gap-2"><FileText className="h-4 w-4 shrink-0" /><div><strong>Próximos passos (fase 2):</strong> builders XML CT-e 4.00 (ide/emit/rem/dest/vPrest/infCteNorm), reaproveitar <code>signXml</code> com <code>&lt;infCte Id&gt;</code>, endpoints CT-e por UF, server fns <code>emitirCteFn</code>, testes com certificado A1. Mesmo plano para MDF-e 3.00 (encerramento).</div></div>
      </Card>
    </div>
  );
}
