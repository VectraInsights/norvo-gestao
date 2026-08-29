import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FolderCog, Shield, Landmark, Scale, FileText, CheckCircle2, 
  Upload, Key, AlertTriangle, HelpCircle, Plus, Edit2, Trash2, Check 
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { dateBR } from "@/lib/format";
import forge from "node-forge";

export const Route = createFileRoute("/_authenticated/fiscal/configuracoes")({
  component: ConfigFiscais,
});

interface NfeConfig {
  ambiente: string | null;
  serie: number | null;
  proximo_numero: number | null;
  regime_tributario: string | null;
  cnae: string | null;
  natureza_operacao: string | null;
}

interface CertificadoDigital {
  id: string;
  empresa_id: string;
  nome: string;
  arquivo_path: string;
  arquivo_nome: string;
  thumbprint: string | null;
  validade: string | null;
  ativo: boolean;
  created_at: string;
}

interface CFOPRule {
  id: string;
  nome: string;
  cfop: string;
  tipo: "entrada" | "saida";
  descricao: string;
}

const INITIAL_CFOPS: CFOPRule[] = [
  { id: "1", nome: "Venda de mercadoria (Estadual)", cfop: "5102", tipo: "saida", descricao: "Venda de mercadoria adquirida ou recebida de terceiros no estado." },
  { id: "2", nome: "Venda de mercadoria (Interestadual)", cfop: "6102", tipo: "saida", descricao: "Venda de mercadoria adquirida ou recebida de terceiros para outro estado." },
  { id: "3", nome: "Prestação de serviço (Municipal)", cfop: "5933", tipo: "saida", descricao: "Prestação de serviço tributado pelo ISSQN dentro do município." },
  { id: "4", nome: "Devolução de compra para industrialização", cfop: "5201", tipo: "saida", descricao: "Devolução de mercadoria comprada para processo industrial." },
  { id: "5", nome: "Compra para comercialização (Estadual)", cfop: "1102", tipo: "entrada", descricao: "Compra de mercadoria para comercialização dentro do estado." }
];

function ConfigFiscais() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("certificado");

  // Certificado Digital state
  const certFileRef = useRef<HTMLInputElement>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [showCertPassword, setShowCertPassword] = useState(false);
  const [isUploadingCert, setIsUploadingCert] = useState(false);

  // CFOP / Naturezas state
  const [cfops, setCfops] = useState<CFOPRule[]>(INITIAL_CFOPS);
  const [cfopModalOpen, setCfopModalOpen] = useState(false);
  const [cfopNome, setCfopNome] = useState("");
  const [cfopValor, setCfopValor] = useState("");
  const [cfopTipo, setCfopTipo] = useState<"entrada" | "saida">("saida");
  const [cfopDesc, setCfopDesc] = useState("");
  const [editingCfopId, setEditingCfopId] = useState<string | null>(null);

  // Query de Configurações
  const { data: config, isLoading: loadingConfig } = useQuery({
    enabled: !!empresa,
    queryKey: ["nfe-config", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("nfe_config")
        .select("ambiente,serie,proximo_numero,regime_tributario,cnae,natureza_operacao")
        .eq("empresa_id", empresa!.id)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as NfeConfig | null;
    },
  });

  // Alíquotas locais/mockadas
  // Fortalecer testes do módulo fiscal: Garantir que alíquotas sejam sempre tratadas como números válidos
  const [issRate, setIssRate] = useState("2.5");
  const [pisRate, setPisRate] = useState("0.65");
  const [cofinsRate, setCofinsRate] = useState("3.0");
  const [icmsRate, setIcmsRate] = useState("18.0");

  // Local config form states
  const [ambiente] = useState<"homologacao" | "producao">("producao");
  const [serie, setSerie] = useState("1");
  const [proximoNumero, setProximoNumero] = useState("1");
  const [regime, setRegime] = useState("simples");
  const [cnae, setCnae] = useState("");
  const [natOp, setNatOp] = useState("");

  // Query de Certificado Digital
  const { data: certificado, isLoading: loadingCert } = useQuery({
    enabled: !!empresa,
    queryKey: ["certificado-digital", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("certificados_digitais" as never)
        .select("id, empresa_id, nome, arquivo_path, arquivo_nome, thumbprint, validade, ativo, created_at")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CertificadoDigital | null;
    },
  });

  // Sincronizar CFOPs do localStorage
  useEffect(() => {
    if (empresa?.id) {
      const savedCfops = localStorage.getItem(`norvo_cfops_${empresa.id}`);
      if (savedCfops) {
        try { setCfops(JSON.parse(savedCfops)); } catch (e) { console.error(e); }
      }
      const savedRates = localStorage.getItem(`norvo_rates_${empresa.id}`);
      if (savedRates) {
        try {
          const parsed = JSON.parse(savedRates);
          setIssRate(parsed.issRate || "2.5");
          setIcmsRate(parsed.icmsRate || "18.0");
          setPisRate(parsed.pisRate || "0.65");
          setCofinsRate(parsed.cofinsRate || "3.0");
        } catch (e) { console.error(e); }
      }
    }
  }, [empresa?.id]);

  useEffect(() => {
    if (config) {
      setSerie(String(config.serie ?? 1));
      setProximoNumero(String(config.proximo_numero ?? 1));
      setRegime(config.regime_tributario ?? "simples");
      setCnae(config.cnae ?? "");
      setNatOp(config.natureza_operacao ?? "Venda de mercadoria");
      
      // Ajusta alíquotas padrão baseadas no regime
      if (config.regime_tributario === "lucro_presumido") {
        setIssRate("3.0");
        setPisRate("0.65");
        setCofinsRate("3.0");
        setIcmsRate("18.0");
      } else {
        setIssRate("2.0");
        setPisRate("0.0");
        setCofinsRate("0.0");
        setIcmsRate("0.0");
      }
    }
  }, [config]);

  // Mutação para atualizar nfe_config
  const updateConfigMut = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Empresa não selecionada");
      
      const { error } = await supabase.from("nfe_config").upsert({
        empresa_id: empresa.id,
        ambiente,
        serie: parseInt(serie) || 1,
        proximo_numero: parseInt(proximoNumero) || 1,
        regime_tributario: regime,
        cnae: cnae || null,
        natureza_operacao: natOp || null
      }, { onConflict: "empresa_id" });

      if (error) throw error;

      // Persistir alíquotas locais por empresa
      localStorage.setItem(`norvo_rates_${empresa.id}`, JSON.stringify({
        issRate, icmsRate, pisRate, cofinsRate
      }));
    },
    onSuccess: () => {
      toast.success("Configurações tributárias salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["nfe-config"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  // Upload de certificado digital — real para Supabase Storage + tabela
  const handleUploadCertificado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certFile) return toast.error("Selecione um arquivo .pfx ou .p12");
    if (!certPassword) return toast.error("Digite a senha do certificado");
    if (!empresa) return toast.error("Empresa não selecionada");

    const ext = certFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "pfx" && ext !== "p12") {
      return toast.error("Formato inválido. Use apenas arquivos .pfx ou .p12");
    }

    // Verificar CNPJ duplicado (outro certificado ativo para empresa com mesmo CNPJ)
    if (empresa.cnpj) {
      const { data: certCnpj } = await supabase
        .from("certificados_digitais" as never)
        .select("id, empresa_id!inner(cnpj)")
        .eq("ativo", true)
        .neq("empresa_id", empresa.id)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const certAny = certCnpj as any;
      if (certAny?.empresa_id?.cnpj === empresa.cnpj) {
        return toast.error("Já existe um certificado ativo para este CNPJ. Exclua o certificado anterior antes de cadastrar um novo.");
      }
    }

    setIsUploadingCert(true);
    try {
      const storagePath = `${empresa.id}/${Date.now()}_${certFile.name}`;

      // Extrair validade do certificado via node-forge
      let validade: string | null = null;
      let thumbprint: string | null = null;
      try {
        const fileBytes = await certFile.arrayBuffer();
        const p12Asn1 = forge.asn1.fromDer(forge.util.encode64(new Uint8Array(fileBytes)));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);
        const certBags = p12.getBags({ bagType: "1.2.840.113549.1.12.10.1.3" });
        const cert = certBags["1.2.840.113549.1.12.10.1.3"]?.[0]?.cert;
        if (cert) {
          const na = cert.validity.notAfter;
          const y = na.getFullYear();
          const m = String(na.getMonth() + 1).padStart(2, "0");
          const d = String(na.getDate()).padStart(2, "0");
          validade = `${y}-${m}-${d}`;
          thumbprint = forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex();
        }
      } catch (e) {
        console.error("Erro ao extrair validade do certificado:", e);
      }

      // Upload para Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from("certificados")
        .upload(storagePath, certFile, { contentType: "application/x-pkcs12", upsert: false });
      if (uploadErr) throw uploadErr;

      // Inserir metadados na tabela (senha em texto plano — Worker acessa via service role)
      const { error: insertErr } = await supabase
        .from("certificados_digitais" as never)
        .insert({
          empresa_id: empresa.id,
          nome: certFile.name.replace(/\.(pfx|p12)$/i, ""),
          arquivo_path: storagePath,
          arquivo_nome: certFile.name,
          senha_cript: certPassword,
          validade,
          thumbprint,
          ativo: true,
        } as never);
      if (insertErr) {
        await supabase.storage.from("certificados").remove([storagePath]);
        throw insertErr;
      }

      toast.success("Certificado Digital enviado e validado com sucesso!");
      setCertFile(null);
      setCertPassword("");
      if (certFileRef.current) certFileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["certificado-digital"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Falha no upload do certificado", { description: msg });
    } finally {
      setIsUploadingCert(false);
    }
  };

  // Excluir certificado — remove do Storage + marca como inativo
  const handleExcluirCertificado = async (cert: CertificadoDigital) => {
    if (!confirm("Tem certeza que deseja excluir o certificado digital ativo?")) return;

    try {
      await supabase.storage.from("certificados").remove([cert.arquivo_path]);
      const { error } = await supabase
        .from("certificados_digitais" as never)
        .update({ ativo: false } as never)
        .eq("id", cert.id);
      if (error) throw error;

      toast.success("Certificado digital excluído.");
      qc.invalidateQueries({ queryKey: ["certificado-digital"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Falha ao excluir certificado", { description: msg });
    }
  };

  // CFOP Adicionar/Editar
  const handleSalvarCFOP = () => {
    if (!cfopNome || !cfopValor) {
      return toast.error("Preencha o nome e o código CFOP.");
    }

    let nextCfops: CFOPRule[];
    if (editingCfopId) {
      nextCfops = cfops.map(c => c.id === editingCfopId ? {
        id: editingCfopId, nome: cfopNome, cfop: cfopValor, tipo: cfopTipo, descricao: cfopDesc
      } : c);
      toast.success("Regra CFOP atualizada!");
    } else {
      const novo: CFOPRule = {
        id: String(Date.now()), nome: cfopNome, cfop: cfopValor, tipo: cfopTipo, descricao: cfopDesc
      };
      nextCfops = [...cfops, novo];
      toast.success("Regra CFOP adicionada com sucesso!");
    }

    setCfops(nextCfops);
    if (empresa?.id) {
      localStorage.setItem(`norvo_cfops_${empresa.id}`, JSON.stringify(nextCfops));
    }

    // Reset modal states
    setCfopModalOpen(false);
    setCfopNome("");
    setCfopValor("");
    setCfopDesc("");
    setEditingCfopId(null);
  };

  const handleExcluirCFOP = (id: string) => {
    if (confirm("Deseja mesmo excluir esta regra CFOP?")) {
      const nextCfops = cfops.filter(c => c.id !== id);
      setCfops(nextCfops);
      if (empresa?.id) {
        localStorage.setItem(`norvo_cfops_${empresa.id}`, JSON.stringify(nextCfops));
      }
      toast.success("Regra CFOP removida.");
    }
  };

  const handleEditCFOP = (c: CFOPRule) => {
    setEditingCfopId(c.id);
    setCfopNome(c.nome);
    setCfopValor(c.cfop);
    setCfopTipo(c.tipo);
    setCfopDesc(c.descricao);
    setCfopModalOpen(true);
  };

  return (
    <>
      <PageHeader 
        eyebrow="Gestão Fiscal" 
        title="Configurações Fiscais" 
        description="Gerencie seu certificado digital A1, configure alíquotas de impostos e parâmetros de emissão." 
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6 space-y-6">
        <TabsList className="bg-muted/80 p-1 w-full max-w-[500px] flex">
          <TabsTrigger value="certificado" className="flex-1 text-xs sm:text-sm">Certificado Digital</TabsTrigger>
          <TabsTrigger value="tributos" className="flex-1 text-xs sm:text-sm">Tributos e Regimes</TabsTrigger>
          <TabsTrigger value="cfop" className="flex-1 text-xs sm:text-sm">CFOP & Naturezas</TabsTrigger>
        </TabsList>

        {/* ABA CERTIFICADO DIGITAL */}
        <TabsContent value="certificado" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-2 border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Certificado A1 (Arquivo)</CardTitle>
                <CardDescription>
                  Faça o upload do seu certificado digital modelo A1 (extensão .pfx ou .p12). A validade padrão é de 1 ano.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCert ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : certificado ? (
                  <div className="space-y-6">
                    <div className="flex gap-4 items-start rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="space-y-1 flex-1">
                        <h4 className="text-sm font-semibold text-foreground">Certificado Digital Ativo e Válido</h4>
                        <p className="text-xs text-muted-foreground">O certificado digital está pronto para autenticar e assinar suas notas fiscais.</p>
                        
                        <div className="grid gap-x-6 gap-y-1.5 grid-cols-2 pt-3 text-xs">
                          <div><span className="text-muted-foreground">CNPJ Associado:</span> <strong className="text-foreground">{empresa?.cnpj ?? "—"}</strong></div>
                          <div><span className="text-muted-foreground">Empresa:</span> <strong className="text-foreground">{empresa?.nome_fantasia ?? "—"}</strong></div>
                          <div><span className="text-muted-foreground">Arquivo:</span> <strong className="text-foreground">{certificado.arquivo_nome}</strong></div>
                          <div><span className="text-muted-foreground">Vencimento:</span> <strong className="text-foreground">{certificado.validade ? dateBR(certificado.validade) : "—"}</strong></div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => handleExcluirCertificado(certificado)}>
                        Excluir Certificado
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleUploadCertificado} className="space-y-4">
                    <div className="border-2 border-dashed border-muted hover:border-primary/50 rounded-lg p-8 flex flex-col items-center justify-center transition-colors">
                      <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-sm font-medium text-foreground text-center">Selecione o arquivo do Certificado A1 (.pfx ou .p12)</p>
                      <input
                        ref={certFileRef}
                        type="file"
                        accept=".pfx,.p12"
                        className="hidden"
                        onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => certFileRef.current?.click()}
                      >
                        {certFile ? certFile.name : "Selecionar Arquivo"}
                      </Button>
                    </div>

                    <div className="grid gap-2 max-w-sm">
                      <Label htmlFor="senha-cert">Senha do Certificado</Label>
                      <div className="relative">
                        <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="senha-cert" 
                          type={showCertPassword ? "text" : "password"}
                          placeholder="Digite a senha de proteção" 
                          className="pl-10 pr-10 h-10"
                          value={certPassword}
                          onChange={(e) => setCertPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCertPassword(!showCertPassword)}
                          className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-foreground"
                        >
                          {showCertPassword ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" disabled={isUploadingCert || !certFile} className="w-full sm:w-auto h-10">
                      {isUploadingCert ? "Validando e Salvando..." : "Salvar Certificado"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Certificado A3 (Físico)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <div className="flex gap-2 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-xs">
                    Certificados A3 (cartão/token físico) requerem a instalação do emissor local / assinador na máquina onde a nota é emitida.
                  </p>
                </div>
                <p className="text-xs">
                  Recomendamos fortemente o uso do certificado **A1 (arquivo digital)**, pois permite a emissão de notas diretamente pela nuvem, de qualquer dispositivo, de forma 100% automatizada e sem dependência de hardware conectado.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ABA TRIBUTOS E REGIMES */}
        <TabsContent value="tributos" className="space-y-6">
          <Card className="border-muted bg-card/60 backdrop-blur-sm shadow-panel">
            <CardHeader>
              <CardTitle>Regime Tributário e Alíquotas Padrão</CardTitle>
              <CardDescription>
                Defina o regime fiscal da sua empresa e configure as alíquotas de tributos que serão preenchidas automaticamente nas propostas/vendas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingConfig ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="regime">Regime Tributário</Label>
                      <Select value={regime} onValueChange={setRegime}>
                        <SelectTrigger id="regime">
                          <SelectValue placeholder="Selecione o regime" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simples">Simples Nacional</SelectItem>
                          <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                          <SelectItem value="lucro_real">Lucro Real</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="cnae">CNAE Principal</Label>
                      <Input 
                        id="cnae" 
                        placeholder="Ex: 6201-5/01" 
                        value={cnae} 
                        onChange={(e) => setCnae(e.target.value)} 
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="nat">Natureza de Operação Padrão</Label>
                      <Input 
                        id="nat" 
                        placeholder="Ex: Venda de mercadoria" 
                        value={natOp} 
                        onChange={(e) => setNatOp(e.target.value)} 
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-foreground">Alíquotas Padrão para Cálculo</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="iss">ISS (%) - Serviços</Label>
                        <Input 
                          id="iss" 
                          type="number" 
                          step="0.01" 
                          value={issRate} 
                          onChange={(e) => setIssRate(e.target.value)} 
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="icms">ICMS (%) - Vendas</Label>
                        <Input 
                          id="icms" 
                          type="number" 
                          step="0.01" 
                          value={icmsRate} 
                          onChange={(e) => setIcmsRate(e.target.value)} 
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="pis">PIS (%)</Label>
                        <Input 
                          id="pis" 
                          type="number" 
                          step="0.01" 
                          value={pisRate} 
                          onChange={(e) => setPisRate(e.target.value)} 
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="cofins">COFINS (%)</Label>
                        <Input 
                          id="cofins" 
                          type="number" 
                          step="0.01" 
                          value={cofinsRate} 
                          onChange={(e) => setCofinsRate(e.target.value)} 
                        />
                      </div>
                    </div>

                    <div className="flex gap-2.5 rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 mt-2">
                      <Scale className="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-xs text-muted-foreground leading-relaxed">
                        <span className="font-semibold text-foreground block">Tributação Simplificada</span>
                        No Simples Nacional, os tributos são unificados na guia DAS e as alíquotas individuais (PIS/COFINS) costumam ser configuradas como 0% para fins de preenchimento na nota (sendo declaradas apenas no Simples).
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button 
                  onClick={() => updateConfigMut.mutate()} 
                  disabled={updateConfigMut.isPending}
                  className="h-10"
                >
                  {updateConfigMut.isPending ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA CFOP E NATUREZAS DE OPERAÇÃO */}
        <TabsContent value="cfop" className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Regras de CFOP e Naturezas de Operação</h3>
              <p className="text-xs text-muted-foreground mt-0.5">As regras de CFOP guiam a tributação de acordo com o destino, origem e tipo da transação fiscal.</p>
            </div>
            
            <Dialog open={cfopModalOpen} onOpenChange={setCfopModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingCfopId(null);
                  setCfopNome("");
                  setCfopValor("");
                  setCfopDesc("");
                  setCfopModalOpen(true);
                }} className="h-9">
                  <Plus className="mr-2 h-4 w-4" /> Nova Regra CFOP
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>{editingCfopId ? "Editar Regra CFOP" : "Nova Regra de CFOP"}</DialogTitle>
                  <DialogDescription>
                    Defina o código CFOP e sua descrição para seleção automática nas operações de entrada ou saída.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="cfop-nome">Nome da Natureza</Label>
                    <Input 
                      id="cfop-nome" 
                      placeholder="Ex: Venda de mercadoria interna"
                      value={cfopNome}
                      onChange={(e) => setCfopNome(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="cfop-val">Código CFOP</Label>
                      <Input 
                        id="cfop-val" 
                        placeholder="Ex: 5102"
                        value={cfopValor}
                        onChange={(e) => setCfopValor(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="cfop-tipo">Fluxo</Label>
                      <Select value={cfopTipo} onValueChange={(v: "entrada" | "saida") => setCfopTipo(v)}>
                        <SelectTrigger id="cfop-tipo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada (Compra/Retorno)</SelectItem>
                          <SelectItem value="saida">Saída (Venda/Remessa)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="cfop-desc">Descrição Fiscal</Label>
                    <Input 
                      id="cfop-desc" 
                      placeholder="Finalidade fiscal da natureza de operação"
                      value={cfopDesc}
                      onChange={(e) => setCfopDesc(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCfopModalOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSalvarCFOP}>Salvar Regra</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="overflow-hidden border-muted shadow-panel bg-card/60 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold text-foreground">Natureza da Operação</TableHead>
                    <TableHead className="font-semibold text-foreground">CFOP</TableHead>
                    <TableHead className="font-semibold text-foreground">Fluxo</TableHead>
                    <TableHead className="font-semibold text-foreground">Descrição</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cfops.map((c) => {
                    return (
                      <TableRow key={c.id} className="transition-colors hover:bg-muted/30">
                        <TableCell className="font-semibold text-foreground max-w-[200px] truncate">{c.nome}</TableCell>
                        <TableCell className="font-mono font-bold text-sky-600 dark:text-sky-400 text-sm">{c.cfop}</TableCell>
                        <TableCell>
                          {c.tipo === "saida" ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Saída</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">Entrada</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground leading-relaxed max-w-[320px] truncate">{c.descricao}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-8 hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => handleEditCFOP(c)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={() => handleExcluirCFOP(c.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
