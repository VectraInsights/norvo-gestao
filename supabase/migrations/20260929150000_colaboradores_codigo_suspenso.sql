-- Colaboradores: código sequencial por ordem de cadastro + status Suspenso
-- (aplicada via Management API em 29/09/2026; arquivo mantido p/ registro)

-- 1) Novo valor no enum (rodar isolado; ADD VALUE não aceita bloco de transação)
-- ALTER TYPE public.colaborador_status ADD VALUE 'suspenso';

-- 2) Código sequencial
alter table public.colaboradores add column if not exists codigo integer;

with ord as (
  select id, row_number() over (order by created_at, id) as rn
  from public.colaboradores
  where codigo is null
)
update public.colaboradores c set codigo = ord.rn from ord where ord.id = c.id;

create sequence if not exists public.colaboradores_codigo_seq;
select setval('public.colaboradores_codigo_seq', coalesce((select max(codigo) from public.colaboradores), 0));
alter table public.colaboradores alter column codigo set default nextval('public.colaboradores_codigo_seq');
alter table public.colaboradores alter column codigo set not null;
alter table public.colaboradores add constraint colaboradores_codigo_unique unique (codigo);
