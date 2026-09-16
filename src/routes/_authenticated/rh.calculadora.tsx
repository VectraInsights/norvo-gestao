import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { MoneyInput } from "@/components/erp/money-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { brl } from "@/lib/format";
import {
  calcSalarioLiquido, calcFerias, calcDecimoTerceiro, calcHoraExtra, calcRescisao,
  DEDUCAO_DEPENDENTE, TIPOS_RESCISAO, type TipoRescisao,
} from "@/lib/calculos-trabalhistas";

export const Route = createFileRoute("/_authenticated/rh/calculadora")({
  component: CalculadoraPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro: {error.message}
    </div>
  ),
});

function Linha({ rotulo, valor, subtrair, total }: { rotulo: string; valor: number; subtrair?: boolean; total?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${total ? "border-t border-border font-semibold" : ""}`}>
      <span className={subtrair ? "text-muted-foreground" : ""}>{subtrair ? `− ${rotulo}` : rotulo}</span>
      <span className="text-tabular">{subtrair ? `−${brl(valor)}` : brl(valor)}</span>
    </div>
  );
}

function CalculadoraPage() {
  // Salário
  const [salBruto, setSalBruto] = useState("0");
  const [salProv, setSalProv] = useState("0");
  const [salDesc, setSalDesc] = useState("0");
  const [salVT, setSalVT] = useState(false);
  const [salSaude, setSalSaude] = useState("0");
  const [salOdonto, setSalOdonto] = useState("0");
  const [salAlim, setSalAlim] = useState("0");
  const vtDesc = salVT ? Math.round(((Number(salBruto) || 0) * 0.06) * 100) / 100 : 0;
  const outrosDet = vtDesc + (Number(salSaude) || 0) + (Number(salOdonto) || 0) + (Number(salAlim) || 0);
  const [salDep, setSalDep] = useState("0");
  const depDesc = (Number(salDep) || 0) * DEDUCAO_DEPENDENTE;
  const rSal = useMemo(
    () => calcSalarioLiquido(Number(salBruto) || 0, Number(salProv) || 0, outrosDet + (Number(salDesc) || 0), Number(salDep) || 0),
    [salBruto, salProv, salDesc, outrosDet, salDep],
  );

  // Férias
  const [ferSal, setFerSal] = useState("0");
  const [ferDias, setFerDias] = useState("30");
  const [ferAbono, setFerAbono] = useState("0");
  const [ferDecimo, setFerDecimo] = useState(false);
  const [ferDep, setFerDep] = useState("0");
  const rFer = useMemo(
    () => calcFerias(Number(ferSal) || 0, Number(ferDias) || 0, Number(ferAbono) || 0, ferDecimo, Number(ferDep) || 0),
    [ferSal, ferDias, ferAbono, ferDecimo, ferDep],
  );

  // 13º
  const [decSal, setDecSal] = useState("0");
  const [decMeses, setDecMeses] = useState("12");
  const [decDep, setDecDep] = useState("0");
  const rDec = useMemo(
    () => calcDecimoTerceiro(Number(decSal) || 0, Number(decMeses) || 0, Number(decDep) || 0),
    [decSal, decMeses, decDep],
  );

  // Horas extras
  const [heSal, setHeSal] = useState("0");
  const [he50, setHe50] = useState("0");
  const [he100, setHe100] = useState("0");
  const rHe = useMemo(
    () => calcHoraExtra(Number(heSal) || 0, Number(he50) || 0, Number(he100) || 0),
    [heSal, he50, he100],
  );

  // Rescisão
  const [reTipo, setReTipo] = useState<TipoRescisao>("sem-justa");
  const [reSal, setReSal] = useState("0");
  const [reDias, setReDias] = useState("15");
  const [reAdm, setReAdm] = useState("");
  const [reResc, setReResc] = useState("");
  const [reTemVenc, setReTemVenc] = useState(false);
  const [reVencSel, setReVencSel] = useState("30");
  const [reAviso, setReAviso] = useState("30");
  const [reFGTS, setReFGTS] = useState("0");
  const [reDep, setReDep] = useState("0");
  const rRe = useMemo(
    () => calcRescisao(reTipo, {
      salario: Number(reSal) || 0, diasSaldo: Number(reDias) || 0,
      admissao: reAdm, rescisao: reResc,
      feriasVencidasDias: reTemVenc ? Number(reVencSel) || 0 : 0, avisoDias: Number(reAviso) || 0,
      saldoFGTS: Number(reFGTS) || 0, dependentes: Number(reDep) || 0,
    }),
    [reTipo, reSal, reDias, reAdm, reResc, reTemVenc, reVencSel, reAviso, reFGTS, reDep],
  );

  return (
    <div>
      <PageHeader
        title="Calculadora trabalhista"
        description="Simulação rápida de valores (salário, férias, 13º, horas extras e rescisão) com as tabelas de 2026. Estimativa — não vinculada a nenhum funcionário."
      />
      <Tabs defaultValue="salario">
        <TabsList>
          <TabsTrigger value="salario">Salário líquido</TabsTrigger>
          <TabsTrigger value="ferias">Férias</TabsTrigger>
          <TabsTrigger value="decimo">13º salário</TabsTrigger>
          <TabsTrigger value="extras">Horas extras</TabsTrigger>
          <TabsTrigger value="rescisao">Rescisão</TabsTrigger>
        </TabsList>

        <TabsContent value="salario">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-3 p-4">
              <div><Label>Salário bruto</Label><MoneyInput value={salBruto} onChange={setSalBruto} /></div>
              <div><Label>Outros proventos</Label><MoneyInput value={salProv} onChange={setSalProv} /></div>
              <div><Label>Outros descontos</Label><MoneyInput value={salDesc} onChange={setSalDesc} /></div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={salVT} onCheckedChange={(v) => setSalVT(v === true)} />
                Vale-transporte (6% do bruto)
              </label>
              <div><Label>Plano de saúde</Label><MoneyInput value={salSaude} onChange={setSalSaude} /></div>
              <div><Label>Odontológico</Label><MoneyInput value={salOdonto} onChange={setSalOdonto} /></div>
              <div><Label>Alimentação</Label><MoneyInput value={salAlim} onChange={setSalAlim} /></div>
              <div><Label>Dependentes p/ IRRF</Label><Input type="number" min={0} value={salDep} onChange={(e) => setSalDep(e.target.value)} /></div>
            </Card>
            <Card className="p-4">
              <Linha rotulo="Salário bruto" valor={rSal.bruto} />
              <Linha rotulo="Proventos" valor={rSal.proventos} />
              <Linha rotulo="INSS" valor={rSal.inss} subtrair />
              <Linha rotulo="IRRF" valor={rSal.irrf} subtrair />
              {Number(salDep) > 0 && <p className="text-xs text-muted-foreground">Dedução de {salDep} dependente(s) na base do IRRF ({brl(depDesc)}).</p>}
              {vtDesc > 0 && <Linha rotulo="Vale-transporte (6%)" valor={vtDesc} subtrair />}
              {Number(salSaude) > 0 && <Linha rotulo="Plano de saúde" valor={Number(salSaude)} subtrair />}
              {Number(salOdonto) > 0 && <Linha rotulo="Odontológico" valor={Number(salOdonto)} subtrair />}
              {Number(salAlim) > 0 && <Linha rotulo="Alimentação" valor={Number(salAlim)} subtrair />}
              <Linha rotulo="Outros descontos" valor={Number(salDesc) || 0} subtrair />
              <Linha rotulo="Salário líquido" valor={rSal.liquido} total />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ferias">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-3 p-4">
              <div><Label>Salário base</Label><MoneyInput value={ferSal} onChange={setFerSal} /></div>
              <div><Label>Dias de gozo (1–30)</Label><Input type="number" min={1} max={30} value={ferDias} onChange={(e) => setFerDias(e.target.value)} /></div>
              <div><Label>Abono vendido em dias (0–10)</Label><Input type="number" min={0} max={10} value={ferAbono} onChange={(e) => setFerAbono(e.target.value)} /></div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={ferDecimo} onCheckedChange={(v) => setFerDecimo(v === true)} />
                Adiantar 13º junto
              </label>
              <div><Label>Dependentes p/ IRRF</Label><Input type="number" min={0} value={ferDep} onChange={(e) => setFerDep(e.target.value)} /></div>
            </Card>
            <Card className="p-4">
              <Linha rotulo={`Férias (${rFer.diasGozo}d × 1/30)`} valor={rFer.proporcional} />
              <Linha rotulo="Adicional constitucional (⅓)" valor={rFer.terco} />
              <Linha rotulo="INSS" valor={rFer.inssFerias} subtrair />
              <Linha rotulo="IRRF" valor={rFer.irrfFerias} subtrair />
              {Number(ferDep) > 0 && <p className="text-xs text-muted-foreground">Dedução de {ferDep} dependente(s) na base do IRRF.</p>}
              <Linha rotulo="Líquido das férias" valor={rFer.liquidoFerias} total />
              {rFer.abonoDias > 0 && (
                <><Linha rotulo={`Abono pecuniário (${rFer.abonoDias}d, isento)`} valor={rFer.valorAbono} /></>
              )}
              {ferDecimo && (
                <>
                  <Linha rotulo="13º adiantado (bruto)" valor={rFer.decimoBruto} />
                  <Linha rotulo="INSS 13º" valor={rFer.inssDecimo} subtrair />
                  <Linha rotulo="IRRF 13º" valor={rFer.irrfDecimo} subtrair />
                  <Linha rotulo="Líquido 13º" valor={rFer.liquidoDecimo} />
                </>
              )}
              <Linha rotulo="Total a receber" valor={rFer.total} total />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="decimo">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-3 p-4">
              <div><Label>Salário bruto mensal</Label><MoneyInput value={decSal} onChange={setDecSal} /></div>
              <div><Label>Meses trabalhados (1–12)</Label><Input type="number" min={1} max={12} value={decMeses} onChange={(e) => setDecMeses(e.target.value)} /></div>
              <div><Label>Dependentes p/ IRRF</Label><Input type="number" min={0} value={decDep} onChange={(e) => setDecDep(e.target.value)} /></div>
              <p className="text-xs text-muted-foreground">Na prática, a 1ª parcela (até novembro) sai sem descontos; os descontos incidem na 2ª parcela.</p>
            </Card>
            <Card className="p-4">
              <Linha rotulo={`13º bruto (${rDec.meses}/12)`} valor={rDec.bruto} />
              <Linha rotulo="INSS" valor={rDec.inss} subtrair />
              <Linha rotulo="IRRF" valor={rDec.irrf} subtrair />
              {Number(decDep) > 0 && <p className="text-xs text-muted-foreground">Dedução de {decDep} dependente(s) na base do IRRF.</p>}
              <Linha rotulo="13º líquido" valor={rDec.liquido} total />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="extras">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-3 p-4">
              <div><Label>Salário base</Label><MoneyInput value={heSal} onChange={setHeSal} /></div>
              <div><Label>Horas a 50%</Label><Input type="number" min={0} value={he50} onChange={(e) => setHe50(e.target.value)} /></div>
              <div><Label>Horas a 100%</Label><Input type="number" min={0} value={he100} onChange={(e) => setHe100(e.target.value)} /></div>
            </Card>
            <Card className="p-4">
              <Linha rotulo="Valor da hora (sal/220)" valor={rHe.valorHora} />
              <Linha rotulo="Extras 50%" valor={rHe.total50} />
              <Linha rotulo="Extras 100%" valor={rHe.total100} />
              <Linha rotulo="Total de horas extras" valor={rHe.total} total />
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rescisao">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-3 p-4">
              <div><Label>Tipo de rescisão</Label>
                <Select value={reTipo} onValueChange={(v) => setReTipo(v as TipoRescisao)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_RESCISAO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Salário base</Label><MoneyInput value={reSal} onChange={setReSal} /></div>
              <div><Label>Dias de saldo no mês</Label><Input type="number" min={0} max={31} value={reDias} onChange={(e) => setReDias(e.target.value)} /></div>
              <div><Label>Data de admissão</Label><Input type="date" value={reAdm} onChange={(e) => setReAdm(e.target.value)} /></div>
              <div><Label>Data de rescisão</Label><Input type="date" value={reResc} onChange={(e) => setReResc(e.target.value)} /></div>
              <p className="text-xs text-muted-foreground">13º proporcional: {rRe.mesesDecimo}/12 · Férias proporcionais: {rRe.mesesFerias}/12 avos.{rRe.periodoVencido ? " Período aquisitivo completado — marque as vencidas." : ""}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={reTemVenc} onCheckedChange={(v) => setReTemVenc(v === true)} />
                Tem férias vencidas
              </label>
              {reTemVenc && (
                <div><Label>Quantidade</Label>
                  <Select value={reVencSel} onValueChange={setReVencSel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 dias (1 período)</SelectItem>
                      <SelectItem value="60">60 dias (2 períodos)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Aviso prévio (dias, 0 = trabalhado)</Label><Input type="number" min={0} max={90} value={reAviso} onChange={(e) => setReAviso(e.target.value)} /></div>
              <div><Label>Saldo FGTS (p/ multa)</Label><MoneyInput value={reFGTS} onChange={setReFGTS} /></div>
              <div><Label>Dependentes p/ IRRF</Label><Input type="number" min={0} value={reDep} onChange={(e) => setReDep(e.target.value)} /></div>
            </Card>
            <Card className="p-4">
              {rRe.verbas.map((v) => (
                <Linha key={v.nome} rotulo={v.nome} valor={Math.abs(v.valor)} subtrair={v.valor < 0} />
              ))}
              <Linha rotulo="Total bruto" valor={rRe.bruto} total />
              <Linha rotulo="INSS" valor={rRe.inss} subtrair />
              <Linha rotulo="IRRF" valor={rRe.irrf} subtrair />
              <Linha rotulo="Líquido da rescisão" valor={rRe.liquido} total />
              <Linha rotulo="FGTS do mês (8%)" valor={rRe.fgtsMes} />
              {rRe.multaPct > 0 && <Linha rotulo={`Multa FGTS (${Math.round(rRe.multaPct * 100)}%)`} valor={rRe.multaFGTS} />}
              <Linha rotulo="Total FGTS (saldo + multa)" valor={rRe.totalFGTS} total />
              <p className="mt-1 text-xs text-muted-foreground">Aviso indenizado e férias indenizadas (+⅓) não têm INSS/IRRF.</p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      <p className="mt-4 text-xs text-muted-foreground">
        Tabelas 2026: INSS progressivo (teto R$ 988,09) e IRRF Lei 15.270/2025. Valores estimados para noção rápida.
      </p>
    </div>
  );
}
