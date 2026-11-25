import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isSecureVideoUrl,
  lessonPublishError,
  lessonTypes,
  maxCurriculumFileBytes,
} from '@/lib/academy-curriculum';

const courseIdSchema = z.object({ course_id: z.string().uuid() });
const sectionFields = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000),
});
const lessonFields = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(1000),
  lesson_type: z.enum(lessonTypes),
  article_content: z.string().max(50000),
  video_url: z.string().trim().max(2048).nullable().transform((value) => value?.trim() || null)
    .refine((value) => value === null || isSecureVideoUrl(value), 'Use a secure HTTPS address for video links.'),
  file_path: z.string().max(1024).nullable(),
  file_name: z.string().trim().max(255).nullable(),
  file_mime_type: z.string().trim().max(160).nullable(),
  file_size_bytes: z.number().int().min(1).max(maxCurriculumFileBytes).nullable(),
});
const lessonStatus = z.enum(['draft', 'in_review', 'published']);

type CurriculumSupabase = SupabaseClient<Database>;

async function requireCourseAccess(supabase: CurriculumSupabase, userId: string, courseId: string) {
  const [adminRole, instructorRole, courseResult] = await Promise.all([
    supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
    supabase.rpc('has_role', { _user_id: userId, _role: 'instructor' }),
    supabase.from('courses').select('id, title, instructor_id, status').eq('id', courseId).maybeSingle(),
  ]);

  if (adminRole.error || instructorRole.error || courseResult.error || !courseResult.data) {
    throw new Error('This course is unavailable or you do not have access to its curriculum.');
  }
  const isAdmin = adminRole.data === true;
  if (!isAdmin && (instructorRole.data !== true || courseResult.data.instructor_id !== userId)) {
    throw new Error('You can only manage curriculum for courses assigned to your account.');
  }
  return { course: courseResult.data, isAdmin };
}

async function getSection(supabase: CurriculumSupabase, sectionId: string) {
  const result = await supabase.from('course_sections').select('id, course_id').eq('id', sectionId).maybeSingle();
  if (result.error || !result.data) throw new Error('This course section is unavailable.');
  return result.data;
}

async function getLesson(supabase: CurriculumSupabase, lessonId: string) {
  const result = await supabase.from('course_lessons').select('*').eq('id', lessonId).maybeSingle();
  if (result.error || !result.data) throw new Error('This lesson is unavailable.');
  return result.data;
}

export const getCourseCurriculum = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const { course } = await requireCourseAccess(context.supabase, context.userId, data.course_id);
    const [sections, lessons] = await Promise.all([
      context.supabase.from('course_sections').select('*').eq('course_id', data.course_id).order('position').order('created_at'),
      context.supabase.from('course_lessons').select('*').eq('course_id', data.course_id).order('position').order('created_at'),
    ]);
    if (sections.error || lessons.error) throw new Error('Unable to load this course curriculum.');
    return {
      course,
      sections: sections.data.map((section) => ({
        ...section,
        lessons: lessons.data.filter((lesson) => lesson.section_id === section.id),
      })),
    };
  });

export const createCourseSection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseIdSchema.extend(sectionFields.shape))
  .handler(async ({ context, data }) => {
    await requireCourseAccess(context.supabase, context.userId, data.course_id);
    const existing = await context.supabase.from('course_sections').select('position').eq('course_id', data.course_id);
    if (existing.error) throw new Error('Unable to create this section.');
    const position = existing.data.reduce((highest, section) => Math.max(highest, section.position), -1) + 1;
    const { data: section, error } = await context.supabase.from('course_sections')
      .insert({ ...sectionFields.parse(data), course_id: data.course_id, created_by: context.userId, position })
      .select('*').single();
    if (error) throw new Error('Unable to create this section.');
    return section;
  });

export const updateCourseSection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(sectionFields.extend({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const current = await getSection(context.supabase, data.id);
    await requireCourseAccess(context.supabase, context.userId, current.course_id);
    const { data: section, error } = await context.supabase.from('course_sections')
      .update({ ...sectionFields.parse(data), updated_at: new Date().toISOString() }).eq('id', data.id).select('*').single();
    if (error) throw new Error('Unable to save this course section.');
    return section;
  });

export const deleteCourseSection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const current = await getSection(context.supabase, data.id);
    await requireCourseAccess(context.supabase, context.userId, current.course_id);
    const { error } = await context.supabase.from('course_sections').delete().eq('id', data.id);
    if (error) throw new Error('Remove the lessons in this section before deleting it.');
    return { id: data.id };
  });

export const createCourseLesson = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseIdSchema.extend({
    section_id: z.string().uuid(),
    title: lessonFields.shape.title,
    summary: lessonFields.shape.summary,
    lesson_type: lessonFields.shape.lesson_type,
  }))
  .handler(async ({ context, data }) => {
    await requireCourseAccess(context.supabase, context.userId, data.course_id);
    const section = await getSection(context.supabase, data.section_id);
    if (section.course_id !== data.course_id) throw new Error('Choose a section from this course.');
    const existing = await context.supabase.from('course_lessons').select('position').eq('section_id', data.section_id);
    if (existing.error) throw new Error('Unable to create this lesson.');
    const position = existing.data.reduce((highest, lesson) => Math.max(highest, lesson.position), -1) + 1;
    const { data: lesson, error } = await context.supabase.from('course_lessons').insert({
      course_id: data.course_id,
      section_id: data.section_id,
      title: data.title,
      summary: data.summary,
      lesson_type: data.lesson_type,
      created_by: context.userId,
      position,
    }).select('*').single();
    if (error) throw new Error('Unable to create this lesson.');
    return lesson;
  });

export const updateCourseLesson = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(lessonFields.extend({ id: z.string().uuid(), status: lessonStatus }))
  .handler(async ({ context, data }) => {
    const current = await getLesson(context.supabase, data.id);
    const { isAdmin } = await requireCourseAccess(context.supabase, context.userId, current.course_id);
    if (!isAdmin && (current.status !== 'draft' || data.status === 'published')) {
      throw new Error('Only administrators can publish lessons; instructors may edit drafts and submit them for review.');
    }
    if (data.status !== 'draft') {
      const validationError = lessonPublishError({
        lessonType: data.lesson_type,
        articleContent: data.article_content,
        videoUrl: data.video_url,
        filePath: data.file_path,
        fileMimeType: data.file_mime_type,
      });
      if (validationError) throw new Error(validationError);
    }
    const { data: lesson, error } = await context.supabase.from('course_lessons').update({
      title: data.title,
      summary: data.summary,
      lesson_type: data.lesson_type,
      article_content: data.article_content,
      video_url: data.video_url,
      file_path: data.file_path,
      file_name: data.file_name,
      file_mime_type: data.file_mime_type,
      file_size_bytes: data.file_size_bytes,
      status: data.status,
    }).eq('id', data.id).select('*').single();
    if (error) throw new Error('Unable to save this lesson. Confirm its content and course assignment.');
    return lesson;
  });

export const deleteCourseLesson = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const current = await getLesson(context.supabase, data.id);
    const { isAdmin } = await requireCourseAccess(context.supabase, context.userId, current.course_id);
    if (!isAdmin && current.status !== 'draft') throw new Error('Only administrators can remove lessons under review or published.');
    const { error } = await context.supabase.from('course_lessons').delete().eq('id', data.id);
    if (error) throw new Error('Unable to remove this lesson.');
    return { id: data.id, file_path: current.file_path };
  });

export const moveCourseContent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    kind: z.enum(['section', 'lesson']),
    id: z.string().uuid(),
    direction: z.enum(['up', 'down']),
  }))
  .handler(async ({ context, data }) => {
    if (data.kind === 'section') {
      const current = await getSection(context.supabase, data.id);
      await requireCourseAccess(context.supabase, context.userId, current.course_id);
      const { data: siblings, error } = await context.supabase.from('course_sections').select('id, position')
        .eq('course_id', current.course_id).order('position').order('created_at');
      if (error) throw new Error('Unable to reorder course sections.');
      const index = siblings.findIndex((section) => section.id === current.id);
      const nextIndex = data.direction === 'up' ? index - 1 : index + 1;
      const neighbor = siblings[nextIndex];
      if (index < 0 || !neighbor) return { moved: false };
      const [first, second] = await Promise.all([
        context.supabase.from('course_sections').update({ position: neighbor.position }).eq('id', current.id),
        context.supabase.from('course_sections').update({ position: siblings[index]?.position ?? 0 }).eq('id', neighbor.id),
      ]);
      if (first.error || second.error) throw new Error('Unable to reorder course sections.');
      return { moved: true };
    }

    const current = await getLesson(context.supabase, data.id);
    const { isAdmin } = await requireCourseAccess(context.supabase, context.userId, current.course_id);
    if (!isAdmin && current.status !== 'draft') throw new Error('Instructors can only reorder draft lessons.');
    const { data: siblings, error } = await context.supabase.from('course_lessons').select('id, position, status')
      .eq('section_id', current.section_id).order('position').order('created_at');
    if (error) throw new Error('Unable to reorder lessons.');
    const index = siblings.findIndex((lesson) => lesson.id === current.id);
    const nextIndex = data.direction === 'up' ? index - 1 : index + 1;
    const neighbor = siblings[nextIndex];
    if (index < 0 || !neighbor) return { moved: false };
    if (!isAdmin && neighbor.status !== 'draft') throw new Error('Draft lessons cannot move past lessons already sent for review.');
    const [first, second] = await Promise.all([
      context.supabase.from('course_lessons').update({ position: neighbor.position }).eq('id', current.id),
      context.supabase.from('course_lessons').update({ position: siblings[index]?.position ?? 0 }).eq('id', neighbor.id),
    ]);
    if (first.error || second.error) throw new Error('Unable to reorder lessons.');
    return { moved: true };
  });