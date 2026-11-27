import { z } from "zod";

export const enrollmentSearch = z.object({
  enroll: z.string().uuid().optional().catch(undefined),
});
