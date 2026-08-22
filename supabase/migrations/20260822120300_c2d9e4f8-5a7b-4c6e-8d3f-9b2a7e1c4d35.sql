-- 22/08/2026 — Modelo de acesso em 3 níveis para o modo "aluguel" (SaaS):
-- 1) SUPER ADMIN (dono da plataforma): único que cria novas empresas (CNPJs).
-- 2) ADMIN DA EMPRESA (role owner/admin): cria usuários e define módulos do próprio CNPJ.
-- 3) MEMBRO (role viewer): acessa apenas os módulos marcados em empresa_users.modulos.
--    Array vazio '{}' em um membro = nenhum módulo extra (só Dashboard).
--    owner/admin ignoram a lista (acesso total ao CNPJ deles).

-- ---- Super admins da plataforma ----
create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;
-- Sem policies: nem anon nem authenticated leem/escrevem direto (só service role).

create or replace function private.is_super_admin(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.super_admins where user_id = _user);
$$;

grant execute on function private.is_super_admin(uuid) to authenticated;

-- Dono da plataforma
insert into public.super_admins (user_id)
values ('bfc57401-ac84-43db-8bb1-b1015ee69067')
on conflict (user_id) do nothing;

-- ---- Criação de empresa passa a ser exclusiva do super admin ----
drop policy if exists empresas_insert_own on public.empresas;
drop policy if exists empresas_insert_super_admin on public.empresas;
create policy empresas_insert_super_admin
  on public.empresas for insert to authenticated
  with check (private.is_super_admin(auth.uid()));

-- ---- Módulos por usuário ----
alter table public.empresa_users
  add column if not exists modulos text[] not null default '{}',
  add column if not exists nome text,
  add column if not exists email text;

-- Backfill do cadastro existente (dono da JRM)
update public.empresa_users eu
set nome = coalesce(eu.nome, u.raw_user_meta_data->>'nome', split_part(u.email,'@',1)),
    email = coalesce(eu.email, u.email)
from auth.users u
where eu.user_id = u.id and eu.email is null;
