import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, Search } from "lucide-react";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { supabase } from "@/integrations/supabase/client";
import { MODULOS } from "@/lib/permissoes";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/configuracoes/auditoria")({ component: AuditoriaPage });

type Evento = {
  id: string;
  created_at: string;
  modulo: string;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  user_id: string | null;
  detalhes: Record<string, unknown>;
};

const acaoLabel = (acao: string) => acao.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const dataLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function AuditoriaPage() {
  const { data: empresa } = useEmpresaAtual();
  const [modulo, setModulo] = useState("todos");
  const [acao, setAcao] = useState("");
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const eventos = useQuery({
    queryKey: ["auditoria-eventos", empresa?.id, modulo, acao, desde, ate, busca],
    enabled: Boolean(empresa?.id),
    queryFn: async () => {
      let query = supabase.from("auditoria_eventos").select("id,created_at,modulo,acao,entidade,entidade_id,user_id,detalhes").eq("empresa_id", empresa!.id).order("created_at", { ascending: false }).limit(300);
      if (modulo !== "todos") query = query.eq("modulo", modulo);
      if (acao.trim()) query = query.ilike("acao", `%${acao.trim()}%`);
      if (desde) query = query.gte("created_at", `${desde}T00:00:00`);
      if (ate) query = query.lt("created_at", `${ate}T23:59:59.999`);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Evento[];
      if (!busca.trim()) return rows;
      const term = busca.trim().toLowerCase();
      return rows.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
    },
  });

  return <div className="space-y-6">
    <PageHeader eyebrow="Acessos" title="Auditoria" description="Consulte as ações registradas na empresa, com filtros por módulo, período e evento." />
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div className="space-y-2"><Label>Módulo</Label><Select value={modulo} onValueChange={setModulo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os módulos</SelectItem>{MODULOS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Ação</Label><Input value={acao} onChange={(event) => setAcao(event.target.value)} placeholder="Ex.: criou, editou" /></div>
        <div className="space-y-2"><Label>Desde</Label><Input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} /></div>
        <div className="space-y-2"><Label>Até</Label><Input type="date" value={ate} onChange={(event) => setAte(event.target.value)} /></div>
        <div className="space-y-2"><Label>Busca</Label><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Entidade ou detalhe" /></div></div>
        <Button variant="ghost" className="sm:col-span-2 lg:col-span-5 lg:justify-self-end" onClick={() => { setModulo("todos"); setAcao(""); setDesde(""); setAte(""); setBusca(""); }}>Limpar filtros</Button>
      </CardContent>
    </Card>
    <Card><CardContent className="p-0">
      {eventos.isLoading ? <div className="space-y-3 p-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : eventos.isError ? <EmptyState icon={ClipboardList} title="Não foi possível carregar a auditoria" description="Verifique sua conexão e tente novamente." action={<Button onClick={() => eventos.refetch()}>Tentar novamente</Button>} /> : !eventos.data?.length ? <EmptyState icon={ClipboardList} title="Nenhum evento encontrado" description="Ajuste os filtros ou aguarde novas movimentações." /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Módulo</TableHead><TableHead>Ação</TableHead><TableHead>Entidade</TableHead><TableHead>Usuário</TableHead><TableHead>Detalhes</TableHead></TableRow></TableHeader><TableBody>{eventos.data.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-sm">{dataLabel(item.created_at)}</TableCell><TableCell><Badge variant="secondary">{MODULOS.find((mod) => mod.key === item.modulo)?.label ?? item.modulo}</Badge></TableCell><TableCell className="font-medium">{acaoLabel(item.acao)}</TableCell><TableCell>{item.entidade ? `${item.entidade}${item.entidade_id ? ` · ${item.entidade_id.slice(0, 8)}` : ""}` : "—"}</TableCell><TableCell className="font-mono text-xs">{item.user_id?.slice(0, 8) ?? "sistema"}</TableCell><TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{Object.keys(item.detalhes ?? {}).length ? JSON.stringify(item.detalhes) : "—"}</TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent></Card>
  </div>;
}
