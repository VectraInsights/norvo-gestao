-- Revogar EXECUTE de funções SECURITY DEFINER que não devem ser chamadas diretamente por usuários.
-- Funções de trigger e helpers internos não precisam ser executáveis pelo role authenticated/anon.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_empresa() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_empresa_defaults() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_venda_faturada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_movimentacao_atualiza_estoque() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_empresa_role(uuid, uuid, app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_empresa_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- As RPCs emitir_nota_fiscal e cancelar_nota_fiscal fazem verificação interna via has_empresa_role,
-- então permanecem executáveis por authenticated (comportamento intencional).