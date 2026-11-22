REVOKE ALL ON TABLE public.courses FROM anon;
GRANT SELECT (id, title, description, category, level, status, published_at, created_at) ON public.courses TO anon;