
REVOKE ALL ON FUNCTION public.is_empresa_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_empresa_role(UUID, UUID, public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_empresa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_empresa_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_empresa_role(UUID, UUID, public.app_role[]) TO authenticated, service_role;
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public;
