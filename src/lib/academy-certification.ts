import { z } from "zod";

export const questionTypes = ["multiple_choice", "fill_blank", "essay"] as const;
const prompt = z.string().trim().min(1).max(500);
const shortAnswer = z.string().trim().min(1).max(200);
const question = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple_choice"), prompt, choices: z.array(shortAnswer).length(4) }),
  z.object({ type: z.literal("fill_blank"), prompt }),
  z.object({ type: z.literal("essay"), prompt }),
]);
function readLegacyQuestion(value: unknown) {
  return value && typeof value === "object" && !("type" in value)
    ? { ...value, type: "multiple_choice" }
    : value;
}
export const authoredQuiz = z.object({
  passPercent: z.number().int().min(1).max(100),
  questions: z
    .array(
      z.preprocess(
        readLegacyQuestion,
        z.discriminatedUnion("type", [
          z.object({
            type: z.literal("multiple_choice"),
            prompt,
            choices: z.array(shortAnswer).length(4),
            correct: z.number().int().min(0).max(3),
          }),
          z.object({
            type: z.literal("fill_blank"),
            prompt,
            accepted: z.array(shortAnswer).min(1).max(10),
          }),
          z.object({ type: z.literal("essay"), prompt }),
        ]),
      ),
    )
    .min(1)
    .max(20),
});
export const essayReviewList = z.array(
  z.object({
    id: z.string().uuid(),
    learnerName: z.string(),
    essays: z.array(z.object({ prompt: z.string(), answer: z.string() })),
  }),
);
export type EssayReview = z.infer<typeof essayReviewList>[number];
export type QuizAnswer = number | string;
export const courseCertification = z.object({
  eligible: z.boolean(),
  certificateId: z.string().uuid().nullable(),
  modules: z.array(
    z.object({
      sectionId: z.string().uuid(),
      completed: z.boolean(),
      passed: z.boolean(),
      pendingReview: z.boolean().default(false),
      score: z.number().int().min(0).max(100).nullable(),
      quiz: z
        .object({
          revision: z.string().uuid(),
          passPercent: z.number().int().min(1).max(100),
          questions: z.array(z.preprocess(readLegacyQuestion, question)).min(1).max(20),
        })
        .nullable(),
    }),
  ),
});
export const certificateList = z.array(
  z.object({
    id: z.string().uuid(),
    learnerName: z.string(),
    leadInstructorName: z.string().nullable().optional(),
    courseTitle: z.string(),
    issuedAt: z.string().datetime({ offset: true }),
  }),
);
export type AuthoredQuiz = z.infer<typeof authoredQuiz>;
export type ModuleCertification = z.infer<typeof courseCertification>["modules"][number];
export type AcademyCertificateRecord = z.infer<typeof certificateList>[number];
