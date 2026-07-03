
REVOKE EXECUTE ON FUNCTION public.tg_venda_faturada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_empresa_defaults() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_movimentacao_atualiza_estoque() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_venda_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_empresa() FROM PUBLIC, anon, authenticated;
