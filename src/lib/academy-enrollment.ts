import { z } from "zod";

export const enrollmentSearch = z.object({
  enroll: z.string().uuid().optional().catch(undefined),
});

export function findPublishedPreviewCourse<T extends { title: string; category: string }>(
  previewTitle: string,
  category: string,
  courses: readonly T[],
): T | undefined {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const title = normalize(previewTitle);
  const matches = courses.filter(
    (course) => course.category === category && normalize(course.title) === title,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
