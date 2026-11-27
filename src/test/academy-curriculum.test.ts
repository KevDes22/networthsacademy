import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import {
  canChangeLesson,
  isLessonMaterialPath,
  isLessonType,
  isSecureVideoUrl,
  lessonPublishError,
  maxCurriculumFileBytes,
  validateCurriculumFile,
} from "@/lib/academy-curriculum";
import {
  changeCourseLessonStatus,
  createCourseLesson,
  createCourseSection,
  getCourseCurriculum,
  updateCourseLesson,
  updateCourseSection,
} from "@/lib/academy-curriculum.functions";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      inputValidator: (schema: z.ZodTypeAny) => ({
        handler:
          (handler: (input: unknown) => Promise<unknown>) =>
          async ({ data, context }: { data: unknown; context: unknown }) =>
            handler({ data: schema.parse(data), context }),
      }),
    }),
  }),
}));

const userId = "00000000-0000-4000-8000-000000000001";
const courseId = "00000000-0000-4000-8000-000000000002";
const sectionId = "00000000-0000-4000-8000-000000000003";
const lessonId = "00000000-0000-4000-8000-000000000004";
const replacement = `${userId}/${courseId}/${lessonId}/00000000-0000-4000-8000-000000000005`;
const previousFile = `${userId}/${courseId}/${lessonId}/00000000-0000-4000-8000-000000000006`;
const version = "2026-11-27T00:00:00.123456+00:00";
const pdf = { name: "lesson.pdf", type: "application/pdf", size: 128 };
const storedLesson = {
  id: lessonId,
  course_id: courseId,
  section_id: sectionId,
  title: "Read this",
  summary: "",
  status: "draft",
  lesson_type: "resource",
  article_content: "",
  video_url: null,
  updated_at: version,
  file_path: previousFile,
  file_name: pdf.name,
  file_mime_type: pdf.type,
  file_size_bytes: pdf.size,
};
const payload = { ...storedLesson, expected_updated_at: version };

function fakeDatabase({
  role = "instructor",
  assignedTo = userId,
  status = "draft",
  sectionCourse = courseId,
  missingFile = false,
  failedWrite = false,
} = {}) {
  const insert = vi.fn();
  const update = vi.fn();
  const info = vi
    .fn()
    .mockResolvedValue(
      missingFile
        ? { data: null, error: "missing" }
        : { data: { size: pdf.size, contentType: pdf.type }, error: null },
    );
  const rows = {
    courses: { id: courseId, instructor_id: assignedTo },
    course_sections: { id: sectionId, course_id: sectionCourse, position: 4 },
    course_lessons: { ...storedLesson, status, position: 7 },
  };
  const supabase = {
    from: vi.fn((table: keyof typeof rows) => {
      let write: Record<string, unknown> | undefined;
      const row = rows[table];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        single: vi.fn(async () =>
          failedWrite
            ? { data: null, error: "rejected" }
            : { data: { ...row, ...write }, error: null },
        ),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [row], error: null }),
        insert: (data: Record<string, unknown>) => {
          insert(data);
          write = data;
          return query;
        },
        update: (data: Record<string, unknown>) => {
          update(data);
          write = data;
          return query;
        },
      };
      return query;
    }),
    rpc: vi.fn(async (_name, args: { _role: string }) => ({
      data: args._role === role,
      error: null,
    })),
    storage: { from: vi.fn(() => ({ info })) },
  };
  const context = { userId, supabase };
  return {
    insert,
    update,
    info,
    rows,
    call: (handler: unknown, data: unknown) =>
      (handler as (input: { context: typeof context; data: unknown }) => Promise<unknown>)({
        context,
        data,
      }),
  };
}

describe("lesson input", () => {
  it.each([
    ["article", true],
    ["video", true],
    ["resource", true],
    ["quiz", false],
  ])("validates lesson type %s", (type, valid) => expect(isLessonType(type)).toBe(valid));
  it.each([
    "http://example.org/video",
    "https:///example.org",
    "https://user@example.org",
    "javascript:alert(1)",
    "https://exa mple.org",
  ])("rejects invalid video URL %s", (url) => expect(isSecureVideoUrl(url)).toBe(false));
  it("rejects empty, oversized, unsupported and non-video files where applicable", () => {
    expect(validateCurriculumFile({ ...pdf, size: 0 })).toBeTruthy();
    expect(validateCurriculumFile({ ...pdf, size: maxCurriculumFileBytes + 1 })).toBeTruthy();
    expect(validateCurriculumFile({ ...pdf, type: "text/html" })).toBeTruthy();
    expect(validateCurriculumFile(pdf, "video")).toBeTruthy();
    expect(validateCurriculumFile({ ...pdf, size: maxCurriculumFileBytes }, "resource")).toBeNull();
  });
  it("checks readiness for every lesson type", () => {
    const common = { articleContent: " \n\t", videoUrl: null, filePath: null, fileMimeType: null };
    expect(lessonPublishError({ ...common, lessonType: "article" })).toBeTruthy();
    expect(
      lessonPublishError({ ...common, lessonType: "article", articleContent: "First lesson" }),
    ).toBeNull();
    expect(lessonPublishError({ ...common, lessonType: "video" })).toBeTruthy();
    expect(
      lessonPublishError({ ...common, lessonType: "video", videoUrl: "https://example.org/video" }),
    ).toBeNull();
    expect(
      lessonPublishError({
        ...common,
        lessonType: "video",
        filePath: replacement,
        fileMimeType: pdf.type,
      }),
    ).toBeTruthy();
    expect(
      lessonPublishError({
        ...common,
        lessonType: "video",
        filePath: replacement,
        fileMimeType: "video/mp4",
      }),
    ).toBeNull();
    expect(lessonPublishError({ ...common, lessonType: "resource" })).toBeTruthy();
    expect(
      lessonPublishError({
        ...common,
        lessonType: "resource",
        filePath: replacement,
        fileMimeType: pdf.type,
      }),
    ).toBeNull();
  });
  it("accepts only the exact lesson path layout", () => {
    expect(isLessonMaterialPath(replacement, courseId, lessonId)).toBe(true);
    expect(isLessonMaterialPath(replacement, sectionId, lessonId)).toBe(false);
    expect(isLessonMaterialPath(replacement, courseId, sectionId)).toBe(false);
    expect(isLessonMaterialPath(replacement + "/extra", courseId, lessonId)).toBe(false);
  });
});

describe("authenticated curriculum handlers with a mocked Supabase client", () => {
  it.each([
    ["admin", sectionId, true],
    ["instructor", userId, true],
    ["instructor", sectionId, false],
    ["learner", userId, false],
  ])("checks access for %s with assignment %s", async (role, assignedTo, allowed) => {
    const database = fakeDatabase({ role, assignedTo });
    const result = database.call(getCourseCurriculum, { course_id: courseId });
    if (allowed) await expect(result).resolves.toMatchObject({ isAdmin: role === "admin" });
    else await expect(result).rejects.toThrow(/assigned/);
  });

  it("creates and edits sections and creates a draft lesson in the assigned course", async () => {
    const db = fakeDatabase();
    await db.call(createCourseSection, {
      course_id: courseId,
      title: "  First  ",
      description: "",
    });
    expect(db.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 5, title: "First" }),
    );
    await db.call(updateCourseSection, { id: sectionId, title: "Second", description: "Overview" });
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Second", description: "Overview" }),
    );
    await db.call(createCourseLesson, {
      course_id: courseId,
      section_id: sectionId,
      title: "Start",
      summary: "",
      lesson_type: "article",
    });
    expect(db.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({ course_id: courseId, section_id: sectionId, position: 8 }),
    );
  });

  it("rejects cross-course insertion and invalid lesson types", async () => {
    const db = fakeDatabase({ sectionCourse: sectionId });
    const data = {
      course_id: courseId,
      section_id: sectionId,
      title: "Start",
      summary: "",
      lesson_type: "article",
    };
    await expect(db.call(createCourseLesson, data)).rejects.toThrow(/section from this course/);
    await expect(db.call(createCourseLesson, { ...data, lesson_type: "quiz" })).rejects.toThrow();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("locks instructor edits during review and denies instructor publication", async () => {
    const locked = fakeDatabase({ status: "in_review" });
    await expect(locked.call(updateCourseLesson, { ...payload, status: "draft" })).rejects.toThrow(
      /locked/,
    );
    const draft = fakeDatabase();
    await expect(
      draft.call(changeCourseLessonStatus, { ...payload, status: "published" }),
    ).rejects.toThrow(/locked/);
    expect(locked.update).not.toHaveBeenCalled();
    expect(draft.update).not.toHaveBeenCalled();
  });

  it("saves drafts and commits the replacement and review status in one update", async () => {
    const db = fakeDatabase();
    await expect(db.call(updateCourseLesson, payload)).resolves.toMatchObject({ status: "draft" });
    db.update.mockClear();
    await expect(
      db.call(updateCourseLesson, { ...payload, file_path: replacement, status: "in_review" }),
    ).resolves.toMatchObject({ file_path: replacement, status: "in_review" });
    expect(db.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ file_path: replacement, status: "in_review" }),
    );
  });

  it("rejects missing replacement objects and reports failed writes without deleting either file", async () => {
    const missing = fakeDatabase({ missingFile: true });
    await expect(
      missing.call(updateCourseLesson, { ...payload, file_path: replacement }),
    ).rejects.toThrow(/missing/);
    expect(missing.update).not.toHaveBeenCalled();
    const failed = fakeDatabase({ failedWrite: true });
    await expect(
      failed.call(updateCourseLesson, { ...payload, file_path: replacement }),
    ).rejects.toThrow(/could not be saved/);
    expect(failed.info).toHaveBeenCalledWith(replacement);
    expect(failed.rows.course_lessons.file_path).toBe(previousFile);
  });

  it("rejects stale writes and supports admin review, return and unpublish", async () => {
    const review = fakeDatabase({ role: "admin", status: "in_review" });
    await expect(
      review.call(changeCourseLessonStatus, { ...payload, status: "published" }),
    ).resolves.toMatchObject({ status: "published" });
    const published = fakeDatabase({ role: "admin", status: "published", missingFile: true });
    await expect(
      published.call(changeCourseLessonStatus, { ...payload, status: "draft" }),
    ).resolves.toMatchObject({ status: "draft" });
    await expect(
      review.call(updateCourseLesson, { ...payload, expected_updated_at: "2026-10-27T00:00:00Z" }),
    ).rejects.toThrow(/changed/);
    expect(canChangeLesson(true, "published", "in_review")).toBe(false);
    expect(canChangeLesson(false, "draft")).toBe(true);
  });
});
