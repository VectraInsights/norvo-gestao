// Componente isolado para permitir code-splitting de `recharts` (~120KB gz).
// Só é carregado quando o usuário abre /financeiro/fluxo.
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export type FluxoPoint = { data: string; entradas: number; saidas: number; saldo: number };

const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function FluxoChart({ data }: { data: FluxoPoint[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="data" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={brl} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v: number | string) => brl(Number(v))}
            contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "8px 12px", boxShadow: "var(--shadow-panel)" }}
          />
          <Line type="monotone" dataKey="entradas" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} name="Entradas" />
          <Line type="monotone" dataKey="saidas" stroke="var(--color-destructive)" strokeWidth={2} dot={false} name="Saídas" />
          <Line type="monotone" dataKey="saldo" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} name="Saldo acumulado" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
