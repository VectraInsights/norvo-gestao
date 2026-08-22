-- 22/08/2026 — Fix: "permission denied for function is_empresa_member"
-- A função public.is_empresa_member foi recriada no projeto novo com ACL restrita
-- (apenas postgres/service_role), bloqueando INSERTs de usuários autenticados em
-- todas as tabelas cujas policies usam a versão pública (colaboradores, comissoes,
-- adiantamentos, emprestimos, folha_pagamento, crm_*, ferias_*).
-- A versão private.is_empresa_member já tinha o grant correto; esta migration alinha.
GRANT EXECUTE ON FUNCTION public.is_empresa_member(uuid, uuid) TO authenticated;
