// Mini gráfico isolado para permitir code-split do recharts no dashboard.
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export type ReceitaPoint = { data: string; total: number };

const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function ReceitaChart({ data }: { data: ReceitaPoint[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="data" stroke="var(--color-muted-foreground)" fontSize={11} />
          <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={brl} width={70} />
          <Tooltip
            formatter={(v: number | string) => brl(Number(v))}
            contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
          />
          <Area type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={2} fill="url(#recGrad)" name="Receita" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
