import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  authoredQuiz,
  certificateList,
  courseCertification,
  essayReviewList,
} from "@/lib/academy-certification";

const sectionId = z.string().uuid();
const courseId = z.string().uuid();
const learnerInput = z.discriminatedUnion("operation", [
  z.object({ courseId, operation: z.enum(["read", "issue"]) }),
  z.object({ courseId, operation: z.literal("complete"), sectionId }),
  z.object({
    courseId,
    operation: z.literal("submit"),
    sectionId,
    revision: z.string().uuid(),
    answers: z
      .array(z.union([z.number().int().min(0).max(3), z.string().trim().min(1).max(5000)]))
      .min(1)
      .max(20),
  }),
]);

type CertificationDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      academy_manage_module_quiz: { Args: { section_uuid: string; payload?: Json }; Returns: Json };
      academy_course_certification: {
        Args: {
          course_uuid: string;
          operation: string;
          section_uuid?: string;
          quiz_revision?: string;
          answers?: Json;
        };
        Returns: Json;
      };
      academy_review_module_essays: {
        Args: { section_uuid: string; review_uuid?: string; grades?: Json };
        Returns: Json;
      };
      academy_list_certificates: { Args: Record<never, never>; Returns: Json };
    };
  };
};
function certificationClient(client: SupabaseClient<Database>) {
  // Lovable owns generated database types. This describes the migration contract.
  return client as unknown as SupabaseClient<CertificationDatabase>;
}
function certificationError(error: { code: string; message: string }) {
  if (error.code === "PGRST202" || error.code === "42883") {
    return new Error("Quizzes and certificates are temporarily unavailable.");
  }
  if (error.code === "22023") return new Error(error.message);
  return new Error("This quiz or certificate is unavailable. Refresh and try again.");
}

export const manageModuleQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sectionId, quiz: authoredQuiz.optional() }))
  .handler(async ({ context, data }) => {
    const result = await certificationClient(context.supabase).rpc("academy_manage_module_quiz", {
      section_uuid: data.sectionId,
      ...(data.quiz ? { payload: data.quiz } : {}),
    });
    if (result.error) throw certificationError(result.error);
    return authoredQuiz.nullable().parse(result.data);
  });

export const updateCourseCertification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(learnerInput)
  .handler(async ({ context, data }) => {
    const result = await certificationClient(context.supabase).rpc("academy_course_certification", {
      course_uuid: data.courseId,
      operation: data.operation,
      ...("sectionId" in data ? { section_uuid: data.sectionId } : {}),
      ...(data.operation === "submit"
        ? { quiz_revision: data.revision, answers: data.answers }
        : {}),
    });
    if (result.error) throw certificationError(result.error);
    return courseCertification.parse(result.data);
  });

export const listAcademyCertificates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await certificationClient(context.supabase).rpc("academy_list_certificates");
    if (result.error) throw certificationError(result.error);
    return certificateList.parse(result.data);
  });

export const reviewModuleEssays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      sectionId,
      review: z
        .object({ id: z.string().uuid(), grades: z.array(z.boolean()).min(1).max(20) })
        .optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const result = await certificationClient(context.supabase).rpc("academy_review_module_essays", {
      section_uuid: data.sectionId,
      ...(data.review ? { review_uuid: data.review.id, grades: data.review.grades } : {}),
    });
    if (result.error) throw certificationError(result.error);
    return essayReviewList.parse(result.data);
  });
