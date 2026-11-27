-- Reference SQL for Lovable to apply as a managed migration.
-- Prerequisites: existing Academy schema, Supabase Auth and private academy-course-materials bucket.
BEGIN;

CREATE TABLE public.course_enrollments (
  learner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, course_id)
);

CREATE INDEX course_enrollments_course_id_idx ON public.course_enrollments (course_id);
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.course_enrollments FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.academy_is_verified_learner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND public.has_role(u.id, 'learner'::public.app_role)
      AND NOT public.has_role(u.id, 'admin'::public.app_role)
      AND NOT public.has_role(u.id, 'instructor'::public.app_role)
  );
$$;

CREATE FUNCTION public.enroll_in_course(course_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.academy_is_verified_learner() THEN
    RETURN false;
  END IF;

  -- SHARE conflicts with course status updates and permits concurrent enrollments.
  PERFORM 1
  FROM public.courses AS c
  WHERE c.id = course_uuid AND c.status = 'published'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.course_enrollments (learner_id, course_id)
  VALUES (auth.uid(), course_uuid)
  ON CONFLICT (learner_id, course_id) DO NOTHING;

  RETURN true;
END;
$$;

CREATE FUNCTION public.list_my_courses()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description)
              ORDER BY e.enrolled_at DESC, c.id),
    '[]'::jsonb
  )
  FROM public.course_enrollments AS e
  JOIN public.courses AS c ON c.id = e.course_id
  WHERE e.learner_id = auth.uid() AND c.status = 'published'
    AND public.academy_is_verified_learner();
$$;

CREATE FUNCTION public.read_enrolled_course(course_uuid uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description,
    'sections', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id, 'title', s.title, 'description', s.description, 'lessons', content.lessons
        ) ORDER BY s.position, s.created_at, s.id
      )
      FROM public.course_sections AS s
      CROSS JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id, 'title', l.title, 'summary', l.summary, 'lesson_type', l.lesson_type,
            'article_content', l.article_content, 'video_url', l.video_url, 'file_name', l.file_name
          ) ORDER BY l.position, l.created_at, l.id
        ) AS lessons
        FROM public.course_lessons AS l
        WHERE l.course_id = c.id AND l.section_id = s.id AND l.status = 'published'
      ) AS content
      WHERE s.course_id = c.id AND content.lessons IS NOT NULL
    ), '[]'::jsonb)
  )
  FROM public.course_enrollments AS e
  JOIN public.courses AS c ON c.id = e.course_id
  WHERE e.learner_id = auth.uid() AND c.id = course_uuid AND c.status = 'published'
    AND public.academy_is_verified_learner();
$$;

CREATE FUNCTION public.academy_can_read_enrolled_material(object_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_lessons AS l
    JOIN public.courses AS c ON c.id = l.course_id
    JOIN public.course_enrollments AS e ON e.course_id = c.id AND e.learner_id = auth.uid()
    WHERE l.file_path = object_name
      AND l.status = 'published' AND c.status = 'published'
      AND public.academy_is_verified_learner()
      AND object_name ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(object_name, '/', 2) = c.id::text
      AND split_part(object_name, '/', 3) = l.id::text
  );
$$;

CREATE FUNCTION public.get_enrolled_lesson_material(lesson_uuid uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object('course_id', l.course_id, 'file_path', l.file_path, 'file_name', l.file_name)
  FROM public.course_lessons AS l
  WHERE l.id = lesson_uuid AND l.file_path IS NOT NULL
    AND split_part(l.file_path, '/', 3) = l.id::text
    AND split_part(l.file_path, '/', 2) = l.course_id::text
    AND public.academy_can_read_enrolled_material(l.file_path);
$$;

REVOKE ALL ON FUNCTION public.academy_is_verified_learner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.enroll_in_course(uuid),
  public.list_my_courses(),
  public.read_enrolled_course(uuid),
  public.get_enrolled_lesson_material(uuid),
  public.academy_can_read_enrolled_material(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.enroll_in_course(uuid),
  public.list_my_courses(),
  public.read_enrolled_course(uuid),
  public.get_enrolled_lesson_material(uuid),
  public.academy_can_read_enrolled_material(text)
TO authenticated;

CREATE INDEX course_lessons_enrolled_file_path_idx ON public.course_lessons (file_path)
WHERE status = 'published' AND file_path IS NOT NULL;

CREATE POLICY academy_course_materials_enrolled_learner_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'academy-course-materials'
  AND public.academy_can_read_enrolled_material(name)
);

COMMIT;
