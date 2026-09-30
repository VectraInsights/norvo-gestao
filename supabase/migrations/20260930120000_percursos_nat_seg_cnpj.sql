-- Percursos: natureza da operação + CNPJ da seguradora
-- (aplicada via Management API em 30/09/2026; arquivo mantido p/ registro)
alter table public.cte_percursos add column if not exists nat_operacao text;
alter table public.cte_percursos add column if not exists seg_cnpj text;
