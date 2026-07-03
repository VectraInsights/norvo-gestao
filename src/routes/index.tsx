import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Boxes, FileText, ReceiptText, ShieldCheck, Users } from "lucide-react";
import nimboLogo from "@/assets/nimbo-logo.png";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const modulos = [
  { icon: ReceiptText, titulo: "Financeiro", desc: "Contas a pagar, a receber, fluxo de caixa e conciliação bancária." },
  { icon: Users, titulo: "Vendas & CRM", desc: "Clientes, propostas, pedidos e histórico comercial." },
  { icon: Boxes, titulo: "Estoque", desc: "Produtos, saldos, entradas e saídas com custo médio." },
  { icon: FileText, titulo: "Fiscal", desc: "Emissão de NFe, NFSe e NFCe conforme legislação." },
  { icon: BarChart3, titulo: "Relatórios", desc: "DRE, curva ABC, contas por vencimento e mais." },
  { icon: ShieldCheck, titulo: "Multi-empresa", desc: "Gerencie várias empresas com controle de acesso por papel." },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <span className="text-display text-lg">N</span>
            </div>
            <span className="text-display text-xl">Nimbo.</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Entrar</Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Começar grátis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-xs uppercase tracking-[0.24em] text-primary">ERP na nuvem · Brasil</p>
        <h1 className="mt-4 text-display text-5xl leading-[1.05] text-foreground md:text-7xl">
          A gestão da sua empresa,<br />
          <em className="text-primary">sem planilhas soltas.</em>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Financeiro, vendas, estoque e fiscal — o essencial de um ERP como Omie
          e Conta Azul, em uma interface leve e feita para o dia a dia.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Criar conta gratuita <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#modulos" className="inline-flex items-center rounded-md border border-input bg-card px-5 py-3 text-sm font-medium hover:bg-accent">
            Ver módulos
          </a>
        </div>
      </section>

      {/* Módulos */}
      <section id="modulos" className="border-t border-border/60 bg-secondary/40 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-display text-3xl md:text-4xl">Tudo o que sua operação precisa</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Um esqueleto completo, pronto para você personalizar por segmento.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modulos.map((m) => (
              <div key={m.titulo} className="rounded-xl border border-border bg-card p-6 shadow-panel">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-accent text-accent-foreground">
                  <m.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{m.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Nimbo.</span>
          <span className="text-xs">Esqueleto v0.1</span>
        </div>
      </footer>
    </div>
  );
}
