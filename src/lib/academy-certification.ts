import { z } from "zod";

const question = z.object({
  prompt: z.string().trim().min(1).max(500),
  choices: z.array(z.string().trim().min(1).max(200)).length(4),
});
export const authoredQuiz = z.object({
  passPercent: z.number().int().min(1).max(100),
  questions: z
    .array(question.extend({ correct: z.number().int().min(0).max(3) }))
    .min(1)
    .max(20),
});
export const courseCertification = z.object({
  eligible: z.boolean(),
  certificateId: z.string().uuid().nullable(),
  modules: z.array(
    z.object({
      sectionId: z.string().uuid(),
      completed: z.boolean(),
      passed: z.boolean(),
      score: z.number().int().min(0).max(100).nullable(),
      quiz: z
        .object({
          revision: z.string().uuid(),
          passPercent: z.number().int().min(1).max(100),
          questions: z.array(question).min(1).max(20),
        })
        .nullable(),
    }),
  ),
});
export const certificateList = z.array(
  z.object({
    id: z.string().uuid(),
    learnerName: z.string(),
    courseTitle: z.string(),
    issuedAt: z.string().datetime({ offset: true }),
  }),
);
export type AuthoredQuiz = z.infer<typeof authoredQuiz>;
export type ModuleCertification = z.infer<typeof courseCertification>["modules"][number];
