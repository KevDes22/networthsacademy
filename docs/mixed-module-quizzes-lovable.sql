-- Reference migration. Apply in Lovable after module-certification-lovable.sql.
BEGIN;

CREATE TABLE public.academy_module_essay_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL,
  course_id uuid NOT NULL,
  section_id uuid NOT NULL,
  revision uuid NOT NULL,
  essays jsonb NOT NULL,
  auto_points integer NOT NULL CHECK (auto_points BETWEEN 0 AND 20),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  graded_at timestamptz,
  FOREIGN KEY (learner_id, course_id, section_id)
    REFERENCES public.academy_module_progress(learner_id, course_id, section_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX academy_one_pending_essay_review
  ON public.academy_module_essay_reviews (section_id, learner_id) WHERE graded_at IS NULL;
ALTER TABLE public.academy_module_essay_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_module_essay_reviews FROM PUBLIC, anon, authenticated;

-- Attach the default type without changing existing quiz revisions or scores.
UPDATE public.academy_module_quizzes q
SET questions = (
  SELECT jsonb_agg(
    CASE WHEN item.value ? 'type' THEN item.value
      ELSE item.value || '{"type":"multiple_choice"}'::jsonb END ORDER BY item.position
  )
  FROM jsonb_array_elements(q.questions) WITH ORDINALITY item(value, position)
)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(q.questions) AS item(value)
  WHERE NOT (item.value ? 'type'));

CREATE OR REPLACE FUNCTION public.academy_manage_module_quiz(
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
  question_type text;
  normalized_questions jsonb := '[]'::jsonb;
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
      prompt_text := item ->> 'prompt';
      question_type := coalesce(item ->> 'type', 'multiple_choice');
      IF jsonb_typeof(item -> 'prompt') IS DISTINCT FROM 'string'
        OR prompt_text !~ '[^[:space:]]' OR char_length(prompt_text) > 500 THEN
        RAISE EXCEPTION 'Invalid quiz question.' USING ERRCODE = '22023';
      END IF;
      IF question_type = 'multiple_choice' THEN
        IF jsonb_typeof(item -> 'choices') IS DISTINCT FROM 'array'
          OR jsonb_typeof(item -> 'correct') IS DISTINCT FROM 'number'
          OR coalesce(item ->> 'correct', '') !~ '^[0-3]$' THEN
          RAISE EXCEPTION 'Choose the correct answer.' USING ERRCODE = '22023';
        END IF;
        IF jsonb_array_length(item -> 'choices') <> 4 THEN
          RAISE EXCEPTION 'Provide four answers per question.' USING ERRCODE = '22023';
        END IF;
      ELSIF question_type = 'fill_blank' THEN
        IF jsonb_typeof(item -> 'accepted') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Provide at least one accepted answer.' USING ERRCODE = '22023';
        END IF;
        IF jsonb_array_length(item -> 'accepted') NOT BETWEEN 1 AND 10 THEN
          RAISE EXCEPTION 'Provide between one and ten accepted answers.' USING ERRCODE = '22023';
        END IF;
      ELSIF question_type <> 'essay' THEN
        RAISE EXCEPTION 'Invalid question type.' USING ERRCODE = '22023';
      END IF;
      FOR choice IN SELECT value FROM jsonb_array_elements(CASE question_type
        WHEN 'multiple_choice' THEN item -> 'choices'
        WHEN 'fill_blank' THEN item -> 'accepted'
        ELSE '[]'::jsonb END) LOOP
        IF jsonb_typeof(choice) <> 'string' OR (choice #>> '{}') !~ '[^[:space:]]'
          OR char_length(choice #>> '{}') > 200 THEN
          RAISE EXCEPTION 'Invalid quiz answer.' USING ERRCODE = '22023';
        END IF;
      END LOOP;
      normalized_questions := normalized_questions || jsonb_build_array(
        jsonb_build_object('type', question_type, 'prompt', prompt_text) ||
        CASE question_type
          WHEN 'multiple_choice' THEN jsonb_build_object('choices', item -> 'choices', 'correct', item -> 'correct')
          WHEN 'fill_blank' THEN jsonb_build_object('accepted', item -> 'accepted')
          ELSE '{}'::jsonb END
      );
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.academy_module_essay_reviews r
      WHERE r.section_id = section_uuid AND r.graded_at IS NULL) THEN
      RAISE EXCEPTION 'Grade pending essays before changing this quiz.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.academy_module_quizzes (section_id, pass_percent, questions)
    VALUES (section_uuid, (payload ->> 'passPercent')::integer, normalized_questions)
    ON CONFLICT (section_id) DO UPDATE
      SET pass_percent = excluded.pass_percent, questions = excluded.questions, revision = gen_random_uuid()
      WHERE academy_module_quizzes.pass_percent IS DISTINCT FROM excluded.pass_percent
        OR academy_module_quizzes.questions IS DISTINCT FROM excluded.questions;
  END IF;

  RETURN (SELECT jsonb_build_object('passPercent', q.pass_percent, 'questions', q.questions)
    FROM public.academy_module_quizzes q WHERE q.section_id = section_uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.academy_course_certification(
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
  response jsonb;
  question jsonb;
  question_type text;
  position integer;
  auto_points integer := 0;
  essays jsonb := '[]'::jsonb;
  question_count integer;
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
      IF EXISTS (SELECT 1 FROM public.academy_module_essay_reviews r
        WHERE r.learner_id = learner AND r.section_id = section_uuid AND r.graded_at IS NULL) THEN
        RAISE EXCEPTION 'Your quiz is already awaiting essay review.' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.academy_module_progress p
        WHERE p.learner_id = learner AND p.section_id = section_uuid AND p.passed
          AND p.quiz_revision = quiz.revision) THEN
        RAISE EXCEPTION 'You have already passed this quiz.' USING ERRCODE = '22023';
      END IF;
      question_count := jsonb_array_length(quiz.questions);
      IF jsonb_typeof(answers) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Answer all questions.' USING ERRCODE = '22023';
      END IF;
      IF jsonb_array_length(answers) <> question_count THEN
        RAISE EXCEPTION 'Answer all questions.' USING ERRCODE = '22023';
      END IF;

      FOR position IN 0..question_count - 1 LOOP
        question := quiz.questions -> position;
        response := answers -> position;
        question_type := coalesce(question ->> 'type', 'multiple_choice');
        IF question_type = 'multiple_choice' THEN
          IF jsonb_typeof(response) <> 'number' OR response::text !~ '^[0-3]$' THEN
            RAISE EXCEPTION 'Answer all questions.' USING ERRCODE = '22023';
          END IF;
          IF response = question -> 'correct' THEN auto_points := auto_points + 1; END IF;
        ELSE
          IF jsonb_typeof(response) <> 'string' OR (response #>> '{}') !~ '[^[:space:]]'
            OR char_length(response #>> '{}') > (CASE WHEN question_type = 'essay' THEN 5000 ELSE 200 END) THEN
            RAISE EXCEPTION 'Answer all questions within their length limits.' USING ERRCODE = '22023';
          END IF;
          IF question_type = 'essay' THEN
            essays := essays || jsonb_build_array(jsonb_build_object(
              'prompt', question ->> 'prompt', 'answer', response #>> '{}'));
          ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements_text(question -> 'accepted') AS accepted(value)
            WHERE lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g'))) =
              lower(btrim(regexp_replace(response #>> '{}', '[[:space:]]+', ' ', 'g')))) THEN
            auto_points := auto_points + 1;
          END IF;
        END IF;
      END LOOP;

      IF jsonb_array_length(essays) > 0 THEN
        INSERT INTO public.academy_module_essay_reviews
          (learner_id, course_id, section_id, revision, essays, auto_points)
        VALUES (learner, course_uuid, section_uuid, quiz.revision, essays, auto_points);
        UPDATE public.academy_module_progress p SET score = NULL, passed = false, quiz_revision = quiz.revision
        WHERE p.learner_id = learner AND p.course_id = course_uuid AND p.section_id = section_uuid;
      ELSE
        result_score := floor(100.0 * auto_points / question_count)::integer;
        result_passed := result_score >= quiz.pass_percent;
        UPDATE public.academy_module_progress p
        SET quiz_revision = quiz.revision, score = result_score, passed = result_passed
        WHERE p.learner_id = learner AND p.course_id = course_uuid AND p.section_id = section_uuid;
      END IF;
    END IF;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE p.passed AND p.quiz_revision = q.revision),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'sectionId', s.id, 'completed', p.completed_at IS NOT NULL,
        'passed', coalesce(p.passed AND p.quiz_revision = q.revision, false),
        'pendingReview', EXISTS (
          SELECT 1 FROM public.academy_module_essay_reviews r
          WHERE r.learner_id = learner AND r.section_id = s.id AND r.graded_at IS NULL
        ),
        'score', CASE WHEN p.quiz_revision = q.revision THEN p.score END,
        'quiz', CASE WHEN q.section_id IS NOT NULL AND p.completed_at IS NOT NULL THEN
          jsonb_build_object('revision', q.revision, 'passPercent', q.pass_percent,
            'questions', (SELECT jsonb_agg(jsonb_build_object('prompt', item.value -> 'prompt',
              'type', coalesce(item.value ->> 'type', 'multiple_choice')) ||
              CASE WHEN coalesce(item.value ->> 'type', 'multiple_choice') = 'multiple_choice'
                THEN jsonb_build_object('choices', item.value -> 'choices') ELSE '{}'::jsonb END ORDER BY item.position)
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

CREATE FUNCTION public.academy_review_module_essays(
  section_uuid uuid, review_uuid uuid DEFAULT NULL, grades jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  course_uuid uuid;
  review public.academy_module_essay_reviews%ROWTYPE;
  quiz public.academy_module_quizzes%ROWTYPE;
  essay_points integer;
  final_score integer;
BEGIN
  SELECT s.course_id INTO course_uuid FROM public.course_sections s WHERE s.id = section_uuid;
  IF course_uuid IS NULL OR auth.uid() IS NULL OR NOT public.can_manage_course_content(course_uuid) THEN
    RAISE EXCEPTION 'Essay review is unavailable.' USING ERRCODE = '42501';
  END IF;
  IF review_uuid IS NOT NULL THEN
    PERFORM 1 FROM public.courses WHERE id = course_uuid FOR UPDATE;
    IF NOT FOUND OR NOT public.can_manage_course_content(course_uuid) THEN
      RAISE EXCEPTION 'Essay review is unavailable.' USING ERRCODE = '42501';
    END IF;
    SELECT r.* INTO review FROM public.academy_module_essay_reviews r
      WHERE r.id = review_uuid AND r.section_id = section_uuid AND r.graded_at IS NULL
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This submission is no longer awaiting review.' USING ERRCODE = '22023';
    END IF;
    SELECT q.* INTO quiz FROM public.academy_module_quizzes q WHERE q.section_id = section_uuid;
    IF NOT FOUND OR quiz.revision IS DISTINCT FROM review.revision THEN
      RAISE EXCEPTION 'This quiz has changed.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(grades) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Grade each essay.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(grades) <> jsonb_array_length(review.essays) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(grades) g(value) WHERE jsonb_typeof(g.value) <> 'boolean'
    ) THEN
      RAISE EXCEPTION 'Grade each essay.' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO essay_points FROM jsonb_array_elements(grades) g(value)
      WHERE g.value = 'true'::jsonb;
    final_score := floor(100.0 * (review.auto_points + essay_points) / jsonb_array_length(quiz.questions))::integer;
    UPDATE public.academy_module_progress p
      SET score = final_score, passed = final_score >= quiz.pass_percent
      WHERE p.section_id = section_uuid AND p.learner_id = review.learner_id
        AND p.course_id = course_uuid AND p.quiz_revision = review.revision;
    UPDATE public.academy_module_essay_reviews SET graded_at = now() WHERE id = review_uuid;
  END IF;

  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', queue.id, 'learnerName', coalesce(nullif(btrim(queue.full_name), ''), 'Learner'),
    'essays', queue.essays
  ) ORDER BY queue.submitted_at, queue.id), '[]'::jsonb)
  FROM (
    SELECT r.id, r.essays, r.submitted_at, p.full_name
    FROM public.academy_module_essay_reviews r LEFT JOIN public.profiles p ON p.id = r.learner_id
    WHERE r.section_id = section_uuid AND r.graded_at IS NULL
    ORDER BY r.submitted_at, r.id LIMIT 20
  ) queue);
END;
$$;
REVOKE ALL ON FUNCTION public.academy_review_module_essays(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academy_review_module_essays(uuid, uuid, jsonb) TO authenticated;
COMMIT;
