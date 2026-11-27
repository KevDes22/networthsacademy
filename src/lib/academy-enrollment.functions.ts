import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { curriculumBucket, isLessonMaterialPath } from "@/lib/academy-curriculum";

type CourseArgument = { course_uuid: string };
type EnrollmentDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      enroll_in_course: { Args: CourseArgument; Returns: boolean };
      list_my_courses: { Args: Record<never, never>; Returns: Json };
      read_enrolled_course: { Args: CourseArgument; Returns: Json };
      get_enrolled_lesson_material: { Args: { lesson_uuid: string }; Returns: Json };
    };
  };
};

function enrollmentClient(client: SupabaseClient<Database>) {
  // Lovable generates the database types when the RPC contract is deployed.
  return client as unknown as SupabaseClient<EnrollmentDatabase>;
}

const courseId = z.object({ courseId: z.string().uuid() });
const lessonId = z.object({ lessonId: z.string().uuid() });
const courseSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
});
const courseContent = courseSummary.extend({
  sections: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
      lessons: z.array(
        z.object({
          id: z.string().uuid(),
          title: z.string(),
          summary: z.string(),
          lesson_type: z.enum(["article", "video", "resource"]),
          article_content: z.string(),
          video_url: z.string().nullable(),
          file_name: z.string().nullable(),
        }),
      ),
    }),
  ),
});

function enrollmentError(code?: string) {
  return new Error(
    code === "PGRST202" || code === "42883"
      ? "Enrollment is temporarily unavailable. Please check back later."
      : "This course is unavailable or the request could not be completed. Please try again.",
  );
}

export const enrollInCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseId)
  .handler(async ({ context, data }) => {
    const result = await enrollmentClient(context.supabase).rpc("enroll_in_course", {
      course_uuid: data.courseId,
    });
    if (result.error || result.data !== true) throw enrollmentError(result.error?.code);
    return { courseId: data.courseId };
  });

export const listMyCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await enrollmentClient(context.supabase).rpc("list_my_courses");
    if (result.error) throw enrollmentError(result.error.code);
    return z.array(courseSummary).parse(result.data);
  });

export const readEnrolledCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseId)
  .handler(async ({ context, data }) => {
    const result = await enrollmentClient(context.supabase).rpc("read_enrolled_course", {
      course_uuid: data.courseId,
    });
    if (result.error || !result.data) throw enrollmentError(result.error?.code);
    return courseContent.parse(result.data);
  });

export const downloadEnrolledLessonMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(lessonId)
  .handler(async ({ context, data }) => {
    const result = await enrollmentClient(context.supabase).rpc("get_enrolled_lesson_material", {
      lesson_uuid: data.lessonId,
    });
    if (result.error || !result.data) throw enrollmentError(result.error?.code);
    const material = z
      .object({
        course_id: z.string().uuid(),
        file_path: z.string(),
        file_name: z.string(),
      })
      .parse(result.data);
    if (!isLessonMaterialPath(material.file_path, material.course_id, data.lessonId)) {
      throw new Error("This lesson file is unavailable.");
    }
    const signed = await context.supabase.storage
      .from(curriculumBucket)
      .createSignedUrl(material.file_path, 60, { download: material.file_name || true });
    if (signed.error) throw new Error("This lesson file is unavailable.");
    return signed.data.signedUrl;
  });
