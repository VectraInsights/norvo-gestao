import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Route as RoadIcon, Plus, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";

export const Route = createFileRoute("/_authenticated/fiscal/mdf")({
  component: MdfPage,
  head: () => ({ meta: [{ title: "MDF-e — Norvo" }] }),
});
type MdfDoc = { id: string; numero: string | null; serie: string | null; status: string; qtd_cte: number | null; chave_acesso: string | null; created_at: string };
function MdfPage() {
  const { data: empresa } = useEmpresaAtual();
  const { data: docs, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["mdf-documentos", empresa?.id],
    queryFn: async (): Promise<MdfDoc[]> => {
      const { data, error } = await supabase.from("mdf_documentos" as any).select("id,numero,serie,status,qtd_cte,chave_acesso,created_at").eq("empresa_id", empresa!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as MdfDoc[];
    },
  });
  return (
    <div className="p-6 space-y-6">
      <PageHeader eyebrow="Fiscal" title="MDF-e" description="Manifesto Eletrônico de Documentos Fiscais (modelo 58). Fase 1: estrutura. Fase 2: emissão, vinculação de CT-es e encerramento." actions={<Button size="sm" disabled title="Fase 2"><Plus className="mr-1 h-4 w-4" /> Novo MDF-e</Button>} />
      <Card className="p-4 bg-amber-500/10 border-amber-500/30 text-sm"><strong>Fase 1:</strong> tabela <code>mdf_documentos</code> + <code>mdf_cte_vinculos</code> + lib <code>sefaz-mdf.ts</code>. Emissão/encerramento SEFAZ na fase 2.</Card>
      {isLoading ? <div className="text-sm text-muted-foreground">Carregando…</div> : !docs?.length ? (
        <EmptyState icon={RoadIcon} title="Nenhum MDF-e" description="Manifestos emitidos aparecerão aqui. Na fase 2 será possível vincular CT-es do período e encerrar o manifesto." />
      ) : (
        <Card className="overflow-hidden"><Table><TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Série</TableHead><TableHead>Status</TableHead><TableHead>Qtd CT-e</TableHead><TableHead>Chave</TableHead></TableRow></TableHeader><TableBody>{docs.map(d => (<TableRow key={d.id}><TableCell className="font-mono">{d.numero ?? "—"}</TableCell><TableCell>{d.serie ?? "—"}</TableCell><TableCell><Badge variant="secondary">{d.status}</Badge></TableCell><TableCell>{d.qtd_cte ?? 0}</TableCell><TableCell className="font-mono text-xs truncate max-w-[220px]">{d.chave_acesso ?? "—"}</TableCell></TableRow>))}</TableBody></Table></Card>
      )}
      <Card className="p-4 text-xs text-muted-foreground"><div className="flex gap-2"><FileText className="h-4 w-4 shrink-0" /><div><strong>Fase 2:</strong> builder MDF-e 3.00 (ide/emit/infModal rodoviário), assinatura <code>&lt;infMDFe Id&gt;</code>, endpoints MDF-e, vinculação CT-e, eventos de encerramento/cancelamento.</div></div></Card>
    </div>
  );
}
