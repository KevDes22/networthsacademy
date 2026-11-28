-- Apply after module-certification-lovable.sql. Existing certificate IDs are preserved.
BEGIN;

ALTER TABLE public.academy_certificates ADD COLUMN lead_instructor_name text;

CREATE FUNCTION public.academy_capture_certificate_instructor()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  SELECT nullif(btrim(p.full_name), '') INTO NEW.lead_instructor_name
  FROM public.courses c
  JOIN public.profiles p ON p.id = c.instructor_id
  WHERE c.id = NEW.course_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.academy_capture_certificate_instructor() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER academy_capture_certificate_instructor
BEFORE INSERT ON public.academy_certificates
FOR EACH ROW EXECUTE FUNCTION public.academy_capture_certificate_instructor();

CREATE OR REPLACE FUNCTION public.academy_list_certificates()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'learnerName', c.learner_name, 'courseTitle', c.course_title, 'issuedAt', c.issued_at,
    'leadInstructorName', c.lead_instructor_name
  ) ORDER BY c.issued_at DESC, c.id), '[]'::jsonb)
  FROM public.academy_certificates c
  WHERE c.learner_id = auth.uid() AND public.academy_is_verified_learner();
$$;
COMMIT;
