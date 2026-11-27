-- Reference migration. Apply through Lovable after the enrollment migration.
BEGIN;

CREATE TABLE public.academy_module_quizzes (
  section_id uuid PRIMARY KEY REFERENCES public.course_sections(id) ON DELETE CASCADE,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  pass_percent integer NOT NULL CHECK (pass_percent BETWEEN 1 AND 100),
  questions jsonb NOT NULL
);

CREATE TABLE public.academy_module_progress (
  learner_id uuid NOT NULL,
  course_id uuid NOT NULL,
  section_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  quiz_revision uuid,
  score integer CHECK (score BETWEEN 0 AND 100),
  passed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (learner_id, course_id, section_id),
  FOREIGN KEY (learner_id, course_id)
    REFERENCES public.course_enrollments(learner_id, course_id) ON DELETE CASCADE,
  FOREIGN KEY (section_id, course_id)
    REFERENCES public.course_sections(id, course_id) ON DELETE CASCADE
);

CREATE TABLE public.academy_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  learner_name text NOT NULL CHECK (btrim(learner_name) <> ''),
  course_title text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, course_id)
);

ALTER TABLE public.academy_module_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_module_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_module_quizzes, public.academy_module_progress,
  public.academy_certificates FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.academy_manage_module_quiz(
  section_uuid uuid, payload jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  course_uuid uuid;
  item jsonb;
  choice jsonb;
  prompt_text text;
BEGIN
  SELECT s.course_id INTO course_uuid
    FROM public.course_sections s WHERE s.id = section_uuid;
  IF course_uuid IS NULL OR auth.uid() IS NULL
    OR NOT public.can_manage_course_content(course_uuid) THEN
    RAISE EXCEPTION 'Quiz management is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF payload IS NOT NULL THEN
    PERFORM 1 FROM public.courses WHERE id = course_uuid FOR UPDATE;
    IF NOT FOUND OR NOT public.can_manage_course_content(course_uuid) THEN
      RAISE EXCEPTION 'Quiz management is unavailable.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(payload -> 'passPercent') IS DISTINCT FROM 'number'
      OR coalesce(payload ->> 'passPercent', '') !~ '^[0-9]{1,3}$'
      OR (payload ->> 'passPercent')::integer NOT BETWEEN 1 AND 100
      OR jsonb_typeof(payload -> 'questions') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid quiz settings.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(payload -> 'questions') NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Provide between 1 and 20 questions.' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(payload -> 'questions') LOOP
      prompt_text := btrim(item ->> 'prompt');
      IF jsonb_typeof(item -> 'prompt') IS DISTINCT FROM 'string'
        OR char_length(prompt_text) NOT BETWEEN 1 AND 500
        OR jsonb_typeof(item -> 'choices') IS DISTINCT FROM 'array'
        OR jsonb_typeof(item -> 'correct') IS DISTINCT FROM 'number'
        OR coalesce(item ->> 'correct', '') !~ '^[0-3]$' THEN
        RAISE EXCEPTION 'Invalid quiz question.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(item -> 'choices') <> 4 THEN
        RAISE EXCEPTION 'Provide four answers per question.' USING ERRCODE = '22023';
      END IF;
      FOR choice IN SELECT value FROM jsonb_array_elements(item -> 'choices') LOOP
        IF jsonb_typeof(choice) <> 'string' OR char_length(btrim(choice #>> '{}')) NOT BETWEEN 1 AND 200 THEN
          RAISE EXCEPTION 'Invalid quiz answer.' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;

    INSERT INTO public.academy_module_quizzes (section_id, pass_percent, questions)
    VALUES (section_uuid, (payload ->> 'passPercent')::integer, payload -> 'questions')
    ON CONFLICT (section_id) DO UPDATE
      SET pass_percent = excluded.pass_percent, questions = excluded.questions, revision = gen_random_uuid()
      WHERE academy_module_quizzes.pass_percent IS DISTINCT FROM excluded.pass_percent
        OR academy_module_quizzes.questions IS DISTINCT FROM excluded.questions;
  END IF;

  RETURN (SELECT jsonb_build_object('passPercent', q.pass_percent, 'questions', q.questions)
    FROM public.academy_module_quizzes q WHERE q.section_id = section_uuid);
END;
$$;

CREATE FUNCTION public.academy_course_certification(
  course_uuid uuid, operation text DEFAULT 'read', section_uuid uuid DEFAULT NULL,
  quiz_revision uuid DEFAULT NULL, answers jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  learner uuid := auth.uid();
  module_count integer;
  passed_count integer;
  module_state jsonb;
  course_name text;
  display_name text;
  quiz public.academy_module_quizzes%ROWTYPE;
  result_score integer;
  result_passed boolean;
  certificate_uuid uuid;
BEGIN
  IF NOT public.academy_is_verified_learner() OR operation IS NULL
    OR operation NOT IN ('read', 'complete', 'submit', 'issue') THEN
    RAISE EXCEPTION 'Course certification is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF operation = 'read' THEN
    SELECT c.title INTO course_name FROM public.courses c
      WHERE c.id = course_uuid AND c.status = 'published';
    PERFORM 1 FROM public.course_enrollments e
      WHERE e.course_id = course_uuid AND e.learner_id = learner;
  ELSE
    SELECT c.title INTO course_name FROM public.courses c
      WHERE c.id = course_uuid AND c.status = 'published' FOR SHARE;
    PERFORM 1 FROM public.course_enrollments e
      WHERE e.course_id = course_uuid AND e.learner_id = learner FOR UPDATE;
  END IF;
  IF course_name IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'Course certification is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF operation IN ('complete', 'submit') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.course_lessons l
      WHERE l.course_id = course_uuid AND l.section_id = section_uuid AND l.status = 'published'
    ) THEN
      RAISE EXCEPTION 'This module is unavailable.' USING ERRCODE = '22023';
    END IF;
    IF operation = 'complete' THEN
      INSERT INTO public.academy_module_progress (learner_id, course_id, section_id)
      VALUES (learner, course_uuid, section_uuid) ON CONFLICT DO NOTHING;
    ELSE
      SELECT q.* INTO quiz FROM public.academy_module_quizzes q WHERE q.section_id = section_uuid;
      IF NOT FOUND OR quiz.revision IS DISTINCT FROM quiz_revision
        OR NOT EXISTS (
          SELECT 1 FROM public.academy_module_progress p
          WHERE p.learner_id = learner AND p.course_id = course_uuid AND p.section_id = section_uuid
        ) THEN
        RAISE EXCEPTION 'Complete the module and load its current quiz before submitting.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(answers) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Answer all questions.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(answers) <> jsonb_array_length(quiz.questions) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(answers) AS answer(value)
        WHERE jsonb_typeof(value) <> 'number' OR value::text !~ '^[0-3]$'
      ) THEN
        RAISE EXCEPTION 'Answer all questions.' USING ERRCODE = '22023';
      END IF;
      SELECT floor(100.0 * count(*) FILTER (WHERE a.value = q.value -> 'correct')
        / jsonb_array_length(quiz.questions))::integer INTO result_score
      FROM jsonb_array_elements(answers) WITH ORDINALITY a(value, position)
      JOIN jsonb_array_elements(quiz.questions) WITH ORDINALITY q(value, position) USING (position);
      result_passed := result_score >= quiz.pass_percent;
      UPDATE public.academy_module_progress p
      SET quiz_revision = quiz.revision, score = result_score, passed = result_passed
      WHERE p.learner_id = learner AND p.course_id = course_uuid AND p.section_id = section_uuid
        AND NOT (p.quiz_revision IS NOT DISTINCT FROM quiz.revision AND p.passed);
    END IF;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE p.passed AND p.quiz_revision = q.revision),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'sectionId', s.id, 'completed', p.completed_at IS NOT NULL,
        'passed', coalesce(p.passed AND p.quiz_revision = q.revision, false),
        'score', CASE WHEN p.quiz_revision = q.revision THEN p.score END,
        'quiz', CASE WHEN q.section_id IS NOT NULL AND p.completed_at IS NOT NULL THEN
          jsonb_build_object('revision', q.revision, 'passPercent', q.pass_percent,
            'questions', (SELECT jsonb_agg(jsonb_build_object('prompt', item.value -> 'prompt',
              'choices', item.value -> 'choices') ORDER BY item.position)
              FROM jsonb_array_elements(q.questions) WITH ORDINALITY item(value, position)))
          END
      ) ORDER BY s.position, s.created_at, s.id
    ), '[]'::jsonb)
  INTO module_count, passed_count, module_state
  FROM public.course_sections s
  LEFT JOIN public.academy_module_quizzes q ON q.section_id = s.id
  LEFT JOIN public.academy_module_progress p ON p.learner_id = learner AND p.section_id = s.id AND p.course_id = course_uuid
  WHERE s.course_id = course_uuid AND EXISTS (
    SELECT 1 FROM public.course_lessons l
    WHERE l.section_id = s.id AND l.course_id = course_uuid AND l.status = 'published'
  );

  SELECT c.id INTO certificate_uuid FROM public.academy_certificates c
  WHERE c.learner_id = learner AND c.course_id = course_uuid;
  IF operation = 'issue' AND certificate_uuid IS NULL THEN
    IF module_count = 0 OR passed_count <> module_count THEN
      RAISE EXCEPTION 'Pass the quiz for every published module first.' USING ERRCODE = '22023';
    END IF;
    SELECT nullif(btrim(p.full_name), '') INTO display_name FROM public.profiles p WHERE p.id = learner;
    IF display_name IS NULL THEN
      RAISE EXCEPTION 'Add your full name to your profile first.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.academy_certificates (learner_id, course_id, learner_name, course_title)
    VALUES (learner, course_uuid, display_name, course_name) RETURNING id INTO certificate_uuid;
  END IF;

  RETURN jsonb_build_object('modules', module_state, 'certificateId', certificate_uuid,
    'eligible', module_count > 0 AND passed_count = module_count);
END;
$$;

CREATE FUNCTION public.academy_list_certificates()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'learnerName', c.learner_name, 'courseTitle', c.course_title, 'issuedAt', c.issued_at
  ) ORDER BY c.issued_at DESC, c.id), '[]'::jsonb)
  FROM public.academy_certificates c
  WHERE c.learner_id = auth.uid() AND public.academy_is_verified_learner();
$$;

REVOKE ALL ON FUNCTION public.academy_manage_module_quiz(uuid, jsonb),
  public.academy_course_certification(uuid, text, uuid, uuid, jsonb),
  public.academy_list_certificates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_manage_module_quiz(uuid, jsonb),
  public.academy_course_certification(uuid, text, uuid, uuid, jsonb),
  public.academy_list_certificates() TO authenticated;
COMMIT;
