CREATE OR REPLACE FUNCTION public.can_manage_course_content(_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR (
      public.has_role(auth.uid(), 'instructor')
      AND EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = _course_id AND instructor_id = auth.uid()
      )
    )
$$;
REVOKE ALL ON FUNCTION public.can_manage_course_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_course_content(uuid) TO authenticated;

CREATE TABLE public.course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_sections TO authenticated;
GRANT ALL ON public.course_sections TO service_role;
ALTER TABLE public.course_sections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  section_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 1000),
  lesson_type text NOT NULL CHECK (lesson_type IN ('article', 'video', 'resource')),
  article_content text NOT NULL DEFAULT '' CHECK (length(article_content) <= 50000),
  video_url text CHECK (video_url IS NULL OR length(video_url) <= 2048),
  file_path text,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 1 AND 262144000),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'published')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_lessons_section_course_fkey FOREIGN KEY (section_id, course_id) REFERENCES public.course_sections(id, course_id) ON DELETE CASCADE,
  CONSTRAINT course_lessons_file_metadata_complete CHECK (
    (file_path IS NULL AND file_name IS NULL AND file_mime_type IS NULL AND file_size_bytes IS NULL)
    OR (file_path IS NOT NULL AND file_name IS NOT NULL AND file_mime_type IS NOT NULL AND file_size_bytes IS NOT NULL)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_lessons TO authenticated;
GRANT ALL ON public.course_lessons TO service_role;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_sections_admin_all ON public.course_sections FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY course_sections_instructor_read ON public.course_sections FOR SELECT TO authenticated USING (public.can_manage_course_content(course_id));
CREATE POLICY course_sections_instructor_insert ON public.course_sections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public.can_manage_course_content(course_id) AND created_by = auth.uid());
CREATE POLICY course_sections_instructor_update ON public.course_sections FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'instructor') AND public.can_manage_course_content(course_id)) WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public.can_manage_course_content(course_id));
CREATE POLICY course_sections_instructor_delete_empty ON public.course_sections FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'instructor')
  AND public.can_manage_course_content(course_id)
  AND NOT EXISTS (SELECT 1 FROM public.course_lessons AS lessons WHERE lessons.section_id = course_sections.id)
);
CREATE POLICY course_lessons_admin_all ON public.course_lessons FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY course_lessons_instructor_read ON public.course_lessons FOR SELECT TO authenticated USING (public.can_manage_course_content(course_id));
CREATE POLICY course_lessons_instructor_insert ON public.course_lessons FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'instructor')
  AND public.can_manage_course_content(course_id)
  AND status = 'draft'
  AND created_by = auth.uid()
);
CREATE POLICY course_lessons_instructor_update ON public.course_lessons FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public.can_manage_course_content(course_id) AND status = 'draft')
  WITH CHECK (public.has_role(auth.uid(), 'instructor') AND public.can_manage_course_content(course_id) AND status IN ('draft', 'in_review'));
CREATE POLICY course_lessons_instructor_delete ON public.course_lessons FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'instructor') AND public.can_manage_course_content(course_id) AND status = 'draft');

CREATE OR REPLACE FUNCTION public.guard_course_lesson_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() OR NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Lessons must be created as drafts by the signed-in user';
    END IF;
  ELSIF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Lesson creator cannot be changed';
  END IF;

  IF NEW.video_url IS NOT NULL AND left(NEW.video_url, 8) <> 'https://' THEN
    RAISE EXCEPTION 'Video links must use HTTPS';
  END IF;
  IF NEW.file_path IS NOT NULL AND (
    split_part(NEW.file_path, '/', 2) <> NEW.course_id::text
    OR split_part(NEW.file_path, '/', 3) <> NEW.id::text
    OR split_part(NEW.file_path, '/', 4) = ''
  ) THEN
    RAISE EXCEPTION 'The uploaded file must belong to this lesson';
  END IF;
  IF NEW.status = 'published' THEN
    IF NEW.lesson_type = 'article' AND length(trim(NEW.article_content)) = 0 THEN
      RAISE EXCEPTION 'Add written lesson content before publishing';
    ELSIF NEW.lesson_type = 'video' AND NEW.video_url IS NULL AND NEW.file_path IS NULL THEN
      RAISE EXCEPTION 'Add a video link or upload a video before publishing';
    ELSIF NEW.lesson_type = 'video' AND NEW.file_path IS NOT NULL AND NEW.file_mime_type NOT LIKE 'video/%' THEN
      RAISE EXCEPTION 'Video lessons require a video file';
    ELSIF NEW.lesson_type = 'resource' AND NEW.file_path IS NULL THEN
      RAISE EXCEPTION 'Upload a learning file before publishing';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_course_lesson_changes() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER course_lessons_guard_changes BEFORE INSERT OR UPDATE ON public.course_lessons FOR EACH ROW EXECUTE FUNCTION public.guard_course_lesson_changes();

CREATE INDEX course_sections_course_position_idx ON public.course_sections (course_id, position, created_at);
CREATE INDEX course_lessons_section_position_idx ON public.course_lessons (section_id, position, created_at);
CREATE INDEX course_lessons_course_status_idx ON public.course_lessons (course_id, status);

CREATE POLICY academy_course_materials_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'academy-course-materials'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.course_lessons AS lessons
      WHERE lessons.id::text = split_part(storage.objects.name, '/', 3)
        AND lessons.course_id::text = split_part(storage.objects.name, '/', 2)
        AND public.can_manage_course_content(lessons.course_id)
    )
  )
);
CREATE POLICY academy_course_materials_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'academy-course-materials'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.course_lessons AS lessons
    WHERE lessons.id::text = split_part(name, '/', 3)
      AND lessons.course_id::text = split_part(name, '/', 2)
      AND public.can_manage_course_content(lessons.course_id)
      AND (public.has_role(auth.uid(), 'admin') OR lessons.status = 'draft')
  )
);
CREATE POLICY academy_course_materials_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'academy-course-materials'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.course_lessons AS lessons
      WHERE lessons.id::text = split_part(name, '/', 3)
        AND lessons.course_id::text = split_part(name, '/', 2)
        AND public.can_manage_course_content(lessons.course_id)
        AND (public.has_role(auth.uid(), 'admin') OR lessons.status = 'draft')
    )
  )
  WITH CHECK (
    bucket_id = 'academy-course-materials'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.course_lessons AS lessons
      WHERE lessons.id::text = split_part(name, '/', 3)
        AND lessons.course_id::text = split_part(name, '/', 2)
        AND public.can_manage_course_content(lessons.course_id)
        AND (public.has_role(auth.uid(), 'admin') OR lessons.status = 'draft')
    )
  );
CREATE POLICY academy_course_materials_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'academy-course-materials'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.course_lessons AS lessons
    WHERE lessons.id::text = split_part(name, '/', 3)
      AND lessons.course_id::text = split_part(name, '/', 2)
      AND public.can_manage_course_content(lessons.course_id)
      AND (public.has_role(auth.uid(), 'admin') OR lessons.status = 'draft')
  )
);