-- 19/10/2026 — Cadastros separados por modulo (decisao do dono): clientes, fornecedores e
-- transporte passam a ter TABELAS PROPRIAS.
--
-- Antes tudo vivia em `contatos` com a coluna `tipo` (cliente | fornecedor | ambos |
-- transporte). Isso quebrava o principio de que cada modulo e independente:
--   - o dedupe por CNPJ era global: cadastrar um fornecedor era bloqueado se o mesmo CNPJ
--     ja existisse como transporte (ou cliente) — um modulo atrapalhava o outro;
--   - as listas dos modulos dependiam de um filtro por `tipo` no mesmo conjunto de linhas.
--
-- Agora: `clientes` (Vendas), `fornecedores` (Estoque) e `transportes` (Fiscal). O mesmo
-- CNPJ pode existir nas tres tabelas (a empresa e cliente E fornecedor E transportadora),
-- sem bloqueio entre modulos.
--
-- A tabela `contatos` vira uma VIEW de leitura (union das 3) para as consultas genericas
-- (command palette, relatorios, dashboard). `security_invoker = true` mantem a RLS das
-- tabelas base valendo. A view NAO aceita INSERT/UPDATE: toda escrita do app aponta para
-- a tabela do modulo correspondente.

-- ================== 1) Tabelas ==================
do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'fornecedores', 'transportes'] loop
    execute format($sql$
      create table if not exists public.%I (
        id uuid primary key default gen_random_uuid(),
        empresa_id uuid not null references public.empresas(id) on delete cascade,
        nome text not null,
        documento text,
        email text,
        telefone text,
        logradouro text,
        numero text,
        complemento text,
        bairro text,
        cidade text,
        uf text,
        cep text,
        observacoes text,
        ie text,
        ativo boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    $sql$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all_members', t);
    execute format($sql$
      create policy %I on public.%I for all to authenticated
      using (private.is_empresa_member(empresa_id, auth.uid()))
      with check (private.is_empresa_member(empresa_id, auth.uid()));
    $sql$, t || '_all_members', t);

    execute format('create index if not exists %I on public.%I (empresa_id)', t || '_empresa_id_idx', t);
    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format(
      'create trigger touch_%I before update on public.%I for each row execute function public.tg_touch_updated_at()',
      t, t);
  end loop;
end $$;

-- ================== 2) Migracao dos dados ==================
insert into public.clientes (id, empresa_id, nome, documento, email, telefone, logradouro, numero,
  complemento, bairro, cidade, uf, cep, observacoes, ie, ativo, created_at, updated_at)
select id, empresa_id, nome, documento, email, telefone, logradouro, numero, complemento, bairro,
  cidade, uf, cep, observacoes, ie, ativo, created_at, updated_at
from public.contatos where tipo in ('cliente') on conflict (id) do nothing;

insert into public.fornecedores (id, empresa_id, nome, documento, email, telefone, logradouro, numero,
  complemento, bairro, cidade, uf, cep, observacoes, ie, ativo, created_at, updated_at)
select id, empresa_id, nome, documento, email, telefone, logradouro, numero, complemento, bairro,
  cidade, uf, cep, observacoes, ie, ativo, created_at, updated_at
from public.contatos where tipo in ('fornecedor', 'ambos') on conflict (id) do nothing;

insert into public.transportes (id, empresa_id, nome, documento, email, telefone, logradouro, numero,
  complemento, bairro, cidade, uf, cep, observacoes, ie, ativo, created_at, updated_at)
select id, empresa_id, nome, documento, email, telefone, logradouro, numero, complemento, bairro,
  cidade, uf, cep, observacoes, ie, ativo, created_at, updated_at
from public.contatos where tipo in ('transporte', 'transportadora') on conflict (id) do nothing;

-- ================== 3) contatos vira view ==================
-- As FKs que apontavam para a tabela caem antes (a view nao pode ser alvo de FK).
alter table public.vendas drop constraint if exists vendas_cliente_id_fkey;
alter table public.ordens_servico drop constraint if exists ordens_servico_cliente_id_fkey;
alter table public.viagens drop constraint if exists viagens_cliente_id_fkey;
alter table public.projetos drop constraint if exists projetos_cliente_id_fkey;
alter table public.crm_oportunidades drop constraint if exists crm_oportunidades_contato_id_fkey;
alter table public.ordens_compra drop constraint if exists ordens_compra_fornecedor_id_fkey;
alter table public.notas_fiscais drop constraint if exists notas_fiscais_contato_id_fkey;
alter table public.cte_documentos drop constraint if exists cte_documentos_tomador_id_fkey;
alter table public.lancamentos_financeiros drop constraint if exists lancamentos_financeiros_contato_id_fkey;

alter table public.contatos rename to contatos_legado;

create view public.contatos with (security_invoker = true) as
select id, empresa_id, 'cliente'::contato_tipo as tipo, nome, documento, email, telefone,
  logradouro, numero, complemento, bairro, cidade, uf, cep, observacoes, ie, ativo,
  created_at, updated_at
from public.clientes
union all
select id, empresa_id, 'fornecedor'::contato_tipo as tipo, nome, documento, email, telefone,
  logradouro, numero, complemento, bairro, cidade, uf, cep, observacoes, ie, ativo,
  created_at, updated_at
from public.fornecedores
union all
select id, empresa_id, 'transporte'::contato_tipo as tipo, nome, documento, email, telefone,
  logradouro, numero, complemento, bairro, cidade, uf, cep, observacoes, ie, ativo,
  created_at, updated_at
from public.transportes;

-- as FKs que apontavam para a tabela (e nao para a view) caem junto com ela
drop table public.contatos_legado;

-- ================== 4) FKs apontam para a tabela do modulo ==================
alter table public.vendas
  add constraint vendas_cliente_id_fkey foreign key (cliente_id) references public.clientes(id) on delete set null;
alter table public.ordens_servico
  add constraint ordens_servico_cliente_id_fkey foreign key (cliente_id) references public.clientes(id) on delete set null;
alter table public.viagens
  add constraint viagens_cliente_id_fkey foreign key (cliente_id) references public.clientes(id) on delete set null;
alter table public.projetos
  add constraint projetos_cliente_id_fkey foreign key (cliente_id) references public.clientes(id) on delete set null;
alter table public.crm_oportunidades
  add constraint crm_oportunidades_contato_id_fkey foreign key (contato_id) references public.clientes(id) on delete set null;
alter table public.ordens_compra
  add constraint ordens_compra_fornecedor_id_fkey foreign key (fornecedor_id) references public.fornecedores(id) on delete set null;
alter table public.notas_fiscais
  add constraint notas_fiscais_contato_id_fkey foreign key (contato_id) references public.transportes(id) on delete set null;
alter table public.cte_documentos
  add constraint cte_documentos_tomador_id_fkey foreign key (tomador_id) references public.transportes(id) on delete set null;
-- lancamentos_financeiros.contato_id pode apontar para cliente OU fornecedor: fica sem FK
-- (o app resolve o nome pelas tabelas do modulo).
