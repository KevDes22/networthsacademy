CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  category text NOT NULL CHECK (length(trim(category)) BETWEEN 2 AND 100),
  level text NOT NULL DEFAULT 'Beginner' CHECK (length(trim(level)) BETWEEN 2 AND 50),
  instructor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
GRANT SELECT (id, title, description, category, level, status, published_at, created_at) ON public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY courses_public_read_published ON public.courses FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY courses_admin_read_all ON public.courses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY courses_instructor_read_assigned ON public.courses FOR SELECT TO authenticated USING (instructor_id = auth.uid() AND public.has_role(auth.uid(), 'instructor'));
CREATE POLICY courses_admin_insert ON public.courses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY courses_admin_update ON public.courses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY courses_instructor_update_assigned ON public.courses FOR UPDATE TO authenticated USING (instructor_id = auth.uid() AND public.has_role(auth.uid(), 'instructor')) WITH CHECK (instructor_id = auth.uid() AND public.has_role(auth.uid(), 'instructor'));
CREATE POLICY courses_admin_delete ON public.courses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX courses_instructor_id_idx ON public.courses (instructor_id);
CREATE INDEX courses_status_published_at_idx ON public.courses (status, published_at DESC);
CREATE OR REPLACE FUNCTION public.guard_course_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Administrator access required';
    END IF;
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Course creator must be the signed-in administrator';
    END IF;
    IF NEW.instructor_id IS NOT NULL AND NOT public.has_role(NEW.instructor_id, 'instructor') THEN
      RAISE EXCEPTION 'The assigned account is not an instructor';
    END IF;
    IF NEW.status = 'published' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
    ELSE
      NEW.published_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    IF NEW.instructor_id IS NOT NULL AND NOT public.has_role(NEW.instructor_id, 'instructor') THEN
      RAISE EXCEPTION 'The assigned account is not an instructor';
    END IF;
    IF NEW.status = 'published' THEN
      NEW.published_at := COALESCE(NEW.published_at, now());
    ELSE
      NEW.published_at := NULL;
    END IF;
  ELSIF public.has_role(auth.uid(), 'instructor') AND OLD.instructor_id = auth.uid() THEN
    IF NEW.instructor_id IS DISTINCT FROM OLD.instructor_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
      RAISE EXCEPTION 'Instructors cannot change course assignment or publication status';
    END IF;
  ELSE
    RAISE EXCEPTION 'You may only edit courses assigned to your instructor account';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_course_changes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER courses_guard_changes BEFORE INSERT OR UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.guard_course_changes();
CREATE OR REPLACE FUNCTION public.approve_instructor(target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = target_id AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A verified account is required';
  END IF;
  INSERT INTO public.user_roles(user_id, role)
  VALUES (target_id, 'instructor')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_instructor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_instructor(uuid) TO authenticated;
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
    AND NOT public.has_role(p.id, 'admin')
  ORDER BY p.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.get_verified_instructor_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_verified_instructor_candidates() TO authenticated;