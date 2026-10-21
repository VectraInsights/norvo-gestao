-- 21/10/2026 — Cadastro de NCM do modulo Fiscal (CT-e / MDF-e), SEPARADO do cadastro
-- de produtos do Estoque.
--
-- Decisao do dono: os modulos tem cadastros proprios (clientes / fornecedores /
-- transportes). O NCM do modulo Fiscal nao e a coluna `produtos.ncm` (que pertence ao
-- Estoque) nem a tabela global `ncm` (que e so a referencia oficial do Classif).
-- Aqui fica o cadastro do PRODUTO PREDOMINANTE da carga, que e o que os documentos
-- de transporte realmente transportam:
--   - `x_prod` -> <proPred> do CT-e (infCarga/proPred, texto livre 1-120)
--   - `tp_carga` -> <prodPred><tpCarga> do MDF-e (01-11 = classificacao ANTT)
--   - `ncm` -> <prodPred><NCM> do MDF-e (2 ou 8 digitos, opcional)
--
-- As linhas sao alimentadas pelo import de XML de Nota de Compra (origem 'nf') ou
-- cadastradas na mao (origem 'manual').

create table if not exists public.ncm_fiscal (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ncm text,
  x_prod text not null,
  tp_carga text,
  origem text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ncm_fiscal enable row level security;

drop policy if exists ncm_fiscal_all_members on public.ncm_fiscal;
create policy ncm_fiscal_all_members on public.ncm_fiscal for all to authenticated
  using (private.is_empresa_member(empresa_id, auth.uid()))
  with check (private.is_empresa_member(empresa_id, auth.uid()));

create index if not exists ncm_fiscal_empresa_id_idx on public.ncm_fiscal (empresa_id);
create index if not exists ncm_fiscal_chave_idx on public.ncm_fiscal (empresa_id, ncm, lower(x_prod));

drop trigger if exists touch_ncm_fiscal on public.ncm_fiscal;
create trigger touch_ncm_fiscal before update on public.ncm_fiscal
  for each row execute function public.tg_touch_updated_at();
