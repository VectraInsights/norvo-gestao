import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Boxes, FileText, ReceiptText, ShieldCheck, Users } from "lucide-react";
import norvoLogo from "@/assets/norvo-logo.png";

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
    <div className="min-h-screen bg-[#f5f2ec] text-[#28231e]">
      <header className="border-b border-[#ded8cf]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={norvoLogo} alt="Norvo" width={30} height={30} className="h-7 w-7" />
            <span className="text-display text-2xl">Norvo</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-[#6e665e] md:flex">
            <a href="#modulos" className="hover:text-[#08783d]">Recursos</a>
            <a href="#como-funciona" className="hover:text-[#08783d]">Como funciona</a>
            <Link to="/auth" className="hover:text-[#08783d]">Entrar</Link>
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-lg bg-[#08783d] px-5 py-3 font-semibold text-white shadow-sm hover:bg-[#066b36]">
              Começar grátis <ArrowRight className="h-4 w-4" />
            </Link>
          </nav>
          <Link to="/auth" className="rounded-lg bg-[#08783d] px-4 py-2.5 text-sm font-semibold text-white md:hidden">Começar</Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-20 lg:grid-cols-[1fr_0.9fr] lg:px-10 lg:py-28">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#08783d]">Gestão simples. Decisões melhores.</p>
            <h1 className="mt-5 max-w-2xl text-display text-5xl leading-[1.02] md:text-7xl">
              Sua empresa em ordem, <em className="text-[#08783d]">todos os dias.</em>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#6e665e]">
              O Norvo reúne financeiro, vendas, estoque, fiscal e pessoas em um só lugar — para você trabalhar com clareza e crescer com segurança.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/auth" className="inline-flex items-center gap-2 rounded-lg bg-[#08783d] px-6 py-3.5 font-semibold text-white shadow-sm hover:bg-[#066b36]">
                Criar minha conta <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#modulos" className="inline-flex items-center rounded-lg border border-[#cfc8be] bg-transparent px-6 py-3.5 font-medium hover:bg-white/60">Conhecer recursos</a>
            </div>

          </div>

          <div className="relative mx-auto w-full max-w-[520px]">
            <div className="absolute -inset-5 rounded-[2rem] bg-[#dfe9df]/70 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-[#d7d0c6] bg-white shadow-[0_25px_70px_rgba(52,44,35,0.12)]">
              <div className="border-b border-[#eee9e2] px-5 py-4"><p className="text-xs text-[#8b8278]">Norvo · Empresa</p><p className="mt-1 text-lg font-semibold">Dashboard</p><p className="mt-1 text-xs text-[#8b8278]">Visão geral da operação em tempo real.</p></div>
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">{[["Receita do mês", "R$ 84.620"], ["A receber (aberto)", "R$ 32.410"], ["A pagar (aberto)", "R$ 18.260"], ["Saldo projetado", "R$ 14.150"], ["Vendas ativas", "128"], ["NF-e em rascunho", "6"], ["Clientes", "246"], ["Produtos", "1.284"]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f7f5f1] p-3"><p className="text-[9px] uppercase tracking-wide text-[#8b8278]">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>)}</div>
              <div className="grid gap-3 px-4 pb-4 sm:grid-cols-[1.4fr_1fr]"><div className="rounded-xl border border-[#eee9e2] p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Receita — últimos 30 dias</p><span className="rounded-md bg-[#f0eee9] px-2 py-1 text-[10px] text-[#6e665e]">R$ 84.620</span></div><div className="flex h-24 items-end gap-1">{[34,42,30,58,45,66,52,74,62,88,70,94].map((height, index) => <div key={index} className="flex-1 rounded-t-sm bg-[#08783d]" style={{ height: `${height}%`, opacity: index === 11 ? 1 : 0.48 }} />)}</div></div><div className="rounded-xl border border-[#eee9e2] p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Alertas & estoque baixo</p><span className="text-[#b7791f]">!</span></div><div className="space-y-2 text-xs text-[#6e665e]"><p className="rounded-md bg-[#fff7e6] p-2">Estoque baixo · 4 itens</p><p className="rounded-md bg-[#fff7e6] p-2">2 contas vencendo hoje</p><p className="rounded-md bg-[#f7f5f1] p-2">3 notas em rascunho</p></div></div></div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="border-y border-[#ded8cf] bg-[#eeebe5] py-16"><div className="mx-auto max-w-7xl px-6 lg:px-10"><div className="grid gap-8 md:grid-cols-3"><div><p className="text-4xl font-semibold text-[#08783d]">01</p><h2 className="mt-3 text-xl font-semibold">Centralize sua operação</h2><p className="mt-2 text-sm leading-6 text-[#6e665e]">Tudo que sua equipe precisa, organizado em um fluxo único e fácil de acompanhar.</p></div><div><p className="text-4xl font-semibold text-[#08783d]">02</p><h2 className="mt-3 text-xl font-semibold">Entenda o seu negócio</h2><p className="mt-2 text-sm leading-6 text-[#6e665e]">Indicadores claros para transformar números do dia a dia em decisões melhores.</p></div><div><p className="text-4xl font-semibold text-[#08783d]">03</p><h2 className="mt-3 text-xl font-semibold">Cresça com tranquilidade</h2><p className="mt-2 text-sm leading-6 text-[#6e665e]">Processos confiáveis, permissões seguras e uma base pronta para acompanhar seu ritmo.</p></div></div></div></section>

        <section id="modulos" className="mx-auto max-w-7xl px-6 py-20 lg:px-10"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#08783d]">Um só lugar para tudo</p><h2 className="mt-3 text-display text-4xl md:text-5xl">Clareza para cada parte do negócio.</h2><p className="mt-4 text-[#6e665e]">Módulos integrados que acompanham a rotina da sua empresa, do primeiro lançamento ao fechamento do mês.</p></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{modulos.map((m) => <div key={m.titulo} className="rounded-2xl border border-[#ded8cf] bg-white/60 p-6 transition hover:-translate-y-1 hover:bg-white"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e3f0e5] text-[#08783d]"><m.icon className="h-5 w-5" /></div><h3 className="mt-5 text-lg font-semibold">{m.titulo}</h3><p className="mt-2 text-sm leading-6 text-[#6e665e]">{m.desc}</p></div>)}</div></section>
      </main>
      <footer className="border-t border-[#ded8cf] py-8"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 text-sm text-[#6e665e] lg:px-10"><span>© {new Date().getFullYear()} Norvo</span><span>Gestão que acompanha o seu negócio.</span></div></footer>
    </div>
  );
}
