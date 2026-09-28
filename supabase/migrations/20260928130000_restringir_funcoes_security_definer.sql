-- Restringe funções SECURITY DEFINER internas ao uso por triggers.
-- Funções públicas de negócio mantêm apenas o acesso explicitamente necessário.
REVOKE EXECUTE ON FUNCTION public.gerar_adiantamentos_recorrentes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_adiantamentos_recorrentes() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.tg_adiantamento_delete_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_cargo_delete_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_adiantamento_status() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_empresa_role(uuid, uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_empresa_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_estoque(uuid, numeric, uuid, uuid, text) TO authenticated;
