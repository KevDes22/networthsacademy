import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  curriculumBucket,
  canChangeLesson,
  isLessonMaterialPath,
  validateCurriculumFile,
  isSecureVideoUrl,
  isLessonType,
  lessonPublishError,
  lessonTypes,
  maxCurriculumFileBytes,
} from "@/lib/academy-curriculum";

import { canEditAssignedCourse } from "@/lib/academy";

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
  video_url: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .transform((value) => value?.trim() || null)
    .refine(
      (value) => value === null || isSecureVideoUrl(value),
      "Use a secure HTTPS address for video links.",
    ),
  file_path: z.string().max(1024).nullable(),
  file_name: z.string().trim().max(255).nullable(),
  file_mime_type: z.string().trim().max(160).nullable(),
  file_size_bytes: z.number().int().min(1).max(maxCurriculumFileBytes).nullable(),
});
const lessonStatus = z.enum(["draft", "in_review", "published"]);
const lessonVersion = z.object({
  id: z.string().uuid(),
  expected_updated_at: z.string().datetime({ offset: true }),
});

type CurriculumSupabase = SupabaseClient<Database>;

async function requireCourseAccess(supabase: CurriculumSupabase, userId: string, courseId: string) {
  const [adminRole, instructorRole, courseResult] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "instructor" }),
    supabase
      .from("courses")
      .select("id, title, instructor_id, status")
      .eq("id", courseId)
      .maybeSingle(),
  ]);

  if (adminRole.error || instructorRole.error || courseResult.error || !courseResult.data) {
    throw new Error("This course is unavailable or you do not have access to its curriculum.");
  }
  const isAdmin = adminRole.data === true;
  if (
    !canEditAssignedCourse(
      isAdmin,
      instructorRole.data === true,
      userId,
      courseResult.data.instructor_id,
    )
  ) {
    throw new Error("You can only manage curriculum for courses assigned to your account.");
  }
  return { course: courseResult.data, isAdmin };
}

async function getSection(supabase: CurriculumSupabase, sectionId: string) {
  const result = await supabase
    .from("course_sections")
    .select("id, course_id")
    .eq("id", sectionId)
    .maybeSingle();
  if (result.error || !result.data) throw new Error("This course section is unavailable.");
  return result.data;
}

async function getLesson(supabase: CurriculumSupabase, lessonId: string) {
  const result = await supabase.from("course_lessons").select("*").eq("id", lessonId).maybeSingle();
  if (result.error || !result.data) throw new Error("This lesson is unavailable.");
  return result.data;
}

export const getCourseCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseIdSchema)
  .handler(async ({ context, data }) => {
    const access = await requireCourseAccess(context.supabase, context.userId, data.course_id);
    const [sections, lessons] = await Promise.all([
      context.supabase
        .from("course_sections")
        .select("*")
        .eq("course_id", data.course_id)
        .order("position")
        .order("created_at")
        .order("id"),
      context.supabase
        .from("course_lessons")
        .select("*")
        .eq("course_id", data.course_id)
        .order("position")
        .order("created_at")
        .order("id"),
    ]);
    if (sections.error || lessons.error) throw new Error("Unable to load this course curriculum.");
    const lessonsBySection = new Map<string, StoredLesson[]>();
    for (const lesson of lessons.data) {
      const siblings = lessonsBySection.get(lesson.section_id);
      if (siblings) siblings.push(lesson);
      else lessonsBySection.set(lesson.section_id, [lesson]);
    }
    return {
      course: access.course,
      isAdmin: access.isAdmin,
      sections: sections.data.map((section) => ({
        ...section,
        lessons: lessonsBySection.get(section.id) ?? [],
      })),
    };
  });

export const createCourseSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseIdSchema.extend(sectionFields.shape))
  .handler(async ({ context, data }) => {
    await requireCourseAccess(context.supabase, context.userId, data.course_id);
    const existing = await context.supabase
      .from("course_sections")
      .select("position")
      .eq("course_id", data.course_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error("Unable to create this section.");
    const position = (existing.data?.position ?? -1) + 1;
    const { data: section, error } = await context.supabase
      .from("course_sections")
      .insert({
        ...sectionFields.parse(data),
        course_id: data.course_id,
        created_by: context.userId,
        position,
      })
      .select("*")
      .single();
    if (error) throw new Error("Unable to create this section.");
    return section;
  });

export const updateCourseSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(sectionFields.extend({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const current = await getSection(context.supabase, data.id);
    await requireCourseAccess(context.supabase, context.userId, current.course_id);
    const { data: section, error } = await context.supabase
      .from("course_sections")
      .update({ ...sectionFields.parse(data), updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error("Unable to save this course section.");
    return section;
  });

export const createCourseLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    courseIdSchema.extend({
      section_id: z.string().uuid(),
      title: lessonFields.shape.title,
      summary: lessonFields.shape.summary,
      lesson_type: lessonFields.shape.lesson_type,
    }),
  )
  .handler(async ({ context, data }) => {
    await requireCourseAccess(context.supabase, context.userId, data.course_id);
    const section = await getSection(context.supabase, data.section_id);
    if (section.course_id !== data.course_id) throw new Error("Choose a section from this course.");
    const existing = await context.supabase
      .from("course_lessons")
      .select("position")
      .eq("section_id", data.section_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error("Unable to create this lesson.");
    const position = (existing.data?.position ?? -1) + 1;
    const { data: lesson, error } = await context.supabase
      .from("course_lessons")
      .insert({
        course_id: data.course_id,
        section_id: data.section_id,
        title: data.title,
        summary: data.summary,
        lesson_type: data.lesson_type,
        created_by: context.userId,
        position,
      })
      .select("*")
      .single();
    if (error) throw new Error("Unable to create this lesson.");
    return lesson;
  });

type StoredLesson = Database["public"]["Tables"]["course_lessons"]["Row"];
type LessonContent = Pick<
  StoredLesson,
  | "file_path"
  | "file_name"
  | "file_mime_type"
  | "file_size_bytes"
  | "lesson_type"
  | "video_url"
  | "article_content"
  | "status"
>;

async function validateLessonContent(
  supabase: CurriculumSupabase,
  userId: string,
  current: StoredLesson,
  data: LessonContent,
) {
  if (!isLessonType(data.lesson_type)) throw new Error("Choose a supported lesson type.");
  const storage = supabase.storage.from(curriculumBucket);
  if (data.file_path !== null) {
    if (
      !isLessonMaterialPath(data.file_path, current.course_id, current.id) ||
      (data.file_path !== current.file_path && data.file_path.split("/")[0] !== userId)
    ) {
      throw new Error("Upload a file for this lesson before attaching it.");
    }
    const fileError = validateCurriculumFile(
      {
        name: data.file_name ?? "",
        type: data.file_mime_type ?? "",
        size: data.file_size_bytes ?? 0,
      },
      data.lesson_type,
    );
    if (fileError) throw new Error(fileError);
    const { data: object, error } = await storage.info(data.file_path);
    if (
      error ||
      (object.size ?? object.metadata?.size) !== data.file_size_bytes ||
      (object.contentType ?? object.metadata?.mimetype) !== data.file_mime_type
    ) {
      throw new Error(
        "The attached file is missing or its details changed. Upload it again or remove the attachment.",
      );
    }
  } else if (
    data.file_name !== null ||
    data.file_mime_type !== null ||
    data.file_size_bytes !== null
  ) {
    throw new Error("Remove the attachment details or select a file.");
  }
  if (data.status !== "draft") {
    const validationError = lessonPublishError({
      lessonType: data.lesson_type,
      articleContent: data.article_content,
      videoUrl: data.video_url,
      filePath: data.file_path,
      fileMimeType: data.file_mime_type,
    });
    if (validationError) throw new Error(validationError);
  }
}

export const updateCourseLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(lessonFields.merge(lessonVersion).extend({ status: lessonStatus }))
  .handler(async ({ context, data }) => {
    const current = await getLesson(context.supabase, data.id);
    const { isAdmin } = await requireCourseAccess(
      context.supabase,
      context.userId,
      current.course_id,
    );
    if (!canChangeLesson(isAdmin, current.status, data.status)) {
      throw new Error("This lesson is locked or the requested status change is unavailable.");
    }
    if (current.updated_at !== data.expected_updated_at) {
      throw new Error("This lesson changed. Close the editor and reopen it before saving.");
    }
    await validateLessonContent(context.supabase, context.userId, current, data);
    const { data: lesson, error } = await context.supabase
      .from("course_lessons")
      .update({
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
      })
      .eq("id", data.id)
      .eq("updated_at", data.expected_updated_at)
      .select("*")
      .single();
    if (error)
      throw new Error(
        "The lesson could not be saved. Refresh to check its current state before retrying.",
      );
    return lesson;
  });

export const changeCourseLessonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(lessonVersion.extend({ status: lessonStatus }))
  .handler(async ({ context, data }) => {
    const current = await getLesson(context.supabase, data.id);
    const { isAdmin } = await requireCourseAccess(
      context.supabase,
      context.userId,
      current.course_id,
    );
    if (!canChangeLesson(isAdmin, current.status, data.status) || current.status === data.status) {
      throw new Error("This lesson is locked or the requested status change is unavailable.");
    }
    if (current.updated_at !== data.expected_updated_at) {
      throw new Error("This lesson changed. Refresh it before changing its status.");
    }
    if (data.status !== "draft") {
      await validateLessonContent(context.supabase, context.userId, current, {
        ...current,
        status: data.status,
      });
    }
    const result = await context.supabase
      .from("course_lessons")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("updated_at", data.expected_updated_at)
      .select("id, status")
      .single();
    if (result.error)
      throw new Error(
        "Unable to change the lesson status. Refresh the curriculum before retrying.",
      );
    return result.data;
  });

export const deleteCourseLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(lessonVersion)
  .handler(async ({ context, data }) => {
    const current = await getLesson(context.supabase, data.id);
    const { isAdmin } = await requireCourseAccess(
      context.supabase,
      context.userId,
      current.course_id,
    );
    if (!canChangeLesson(isAdmin, current.status))
      throw new Error("Only administrators can remove locked lessons.");
    const result = await context.supabase
      .from("course_lessons")
      .delete()
      .eq("id", data.id)
      .eq("updated_at", data.expected_updated_at)
      .select("id")
      .maybeSingle();
    if (result.error || !result.data)
      throw new Error("The lesson could not be removed. Reload it before retrying.");
    return result.data;
  });

export const openCourseLessonMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const lesson = await getLesson(context.supabase, data.id);
    await requireCourseAccess(context.supabase, context.userId, lesson.course_id);
    if (!lesson.file_path || !isLessonMaterialPath(lesson.file_path, lesson.course_id, lesson.id)) {
      throw new Error("This lesson has no available private file.");
    }
    const result = await context.supabase.storage
      .from(curriculumBucket)
      .createSignedUrl(lesson.file_path, 60, { download: lesson.file_name || true });
    if (result.error || !result.data.signedUrl)
      throw new Error("This private file could not be opened.");
    return result.data.signedUrl;
  });
