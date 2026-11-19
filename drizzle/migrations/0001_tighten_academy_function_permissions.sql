REVOKE EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_administrator(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_academy_user() FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_academy_user() TO service_role;