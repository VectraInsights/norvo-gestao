-- NF-e reservada em rascunho usa status 'rascunho' em vez de ser deletada.
-- Antes: salvar rascunho DELETAVA as linhas; cancelar/excluir depois não as
-- encontrava (update casava 0 linhas) e a NF sumia da lista. Aplicada via API em 08/09/2026.
ALTER TABLE public.cte_nfes_pendentes DROP CONSTRAINT IF EXISTS cte_nfes_pendentes_status_check;
ALTER TABLE public.cte_nfes_pendentes ADD CONSTRAINT cte_nfes_pendentes_status_check CHECK (status IN ('pendente','embarcada','rascunho'));
