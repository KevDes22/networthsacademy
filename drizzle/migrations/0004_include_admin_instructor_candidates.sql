CREATE OR REPLACE FUNCTION public.get_verified_instructor_candidates()
RETURNS TABLE (user_id uuid, full_name text, email text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.created_at
  FROM public.profiles AS p
  JOIN auth.users AS u ON u.id = p.id
  WHERE public.has_role(auth.uid(), 'admin')
    AND u.email_confirmed_at IS NOT NULL
    AND NOT public.has_role(p.id, 'instructor')
  ORDER BY p.created_at DESC
$$;