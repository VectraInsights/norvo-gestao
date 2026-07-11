
-- Revoga EXECUTE público de todas as SECURITY DEFINER funções internas (triggers/helpers)
REVOKE EXECUTE ON FUNCTION public.tg_empresa_crm_defaults() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_oc_recebida() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_folha_paga() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_venda_faturada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_empresa() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_movimentacao_atualiza_estoque() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_saldo_conta(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_ofx_recalc_saldo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_empresa_defaults() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_empresa_role(uuid, uuid, app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_empresa_member(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Revoga anon das RPCs de nota fiscal (mantém só authenticated; a função valida role internamente)
REVOKE EXECUTE ON FUNCTION public.emitir_nota_fiscal(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_nota_fiscal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_nota_fiscal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_nota_fiscal(uuid, text) TO authenticated;
