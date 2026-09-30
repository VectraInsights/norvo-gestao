-- Percursos: tipo de carga ANTT p/ cálculo do piso mínimo de frete
alter table public.cte_percursos add column if not exists tipo_carga_antt text default 'Carga Geral';
