export const lessonTypes = ["article", "video", "resource"] as const;
export type LessonType = (typeof lessonTypes)[number];

export const curriculumBucket = "academy-course-materials";

export const maxCurriculumFileBytes = 250 * 1024 * 1024;

export const curriculumFileTypes = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "text/markdown",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
] as const;

export const curriculumFileAccept = curriculumFileTypes.join(",");

export function isLessonType(value: string): value is LessonType {
  return lessonTypes.some((lessonType) => lessonType === value);
}

export function isSecureVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /^https:\/\/[^/]/.test(value) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !/[\s\\]/.test(value)
    );
  } catch {
    return false;
  }
}

export function validateCurriculumFile(
  file: { name: string; type: string; size: number },
  lessonType?: LessonType,
): string | null {
  if (!Number.isSafeInteger(file.size) || file.size < 1) return "Choose a non-empty file.";
  if (file.size > maxCurriculumFileBytes) return "Choose a file no larger than 250 MiB.";
  if (!file.name.trim() || file.name.trim().length > 255)
    return "Use a file name between 1 and 255 characters.";
  if (!isCurriculumFileType(file.type)) {
    return "Choose a supported video, PDF, presentation, document, spreadsheet, image, audio, or text file.";
  }
  if (lessonType === "video" && !file.type.startsWith("video/")) {
    return "Choose a video file for this lesson.";
  }
  return null;
}

export function lessonPublishError(input: {
  lessonType: LessonType;
  articleContent: string;
  videoUrl: string | null;
  filePath: string | null;
  fileMimeType: string | null;
}): string | null {
  if (input.videoUrl && !isSecureVideoUrl(input.videoUrl)) {
    return "Use a secure HTTPS address for video links.";
  }
  if (input.filePath && !isCurriculumFileType(input.fileMimeType)) {
    return "Choose a supported learning file.";
  }
  if (input.lessonType === "article" && input.articleContent.trim().length === 0) {
    return "Add written lesson content before submitting or publishing.";
  }
  if (input.lessonType === "video" && !input.videoUrl && !input.filePath) {
    return "Add a secure video link or upload a video before submitting or publishing.";
  }
  if (input.lessonType === "video" && input.filePath && !input.fileMimeType?.startsWith("video/")) {
    return "Upload a video file for this lesson.";
  }
  if (input.lessonType === "resource" && !input.filePath) {
    return "Upload a learning file before submitting or publishing.";
  }
  return null;
}

export function isCurriculumFileType(value: string | null): boolean {
  return curriculumFileTypes.some((type) => type === value);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isLessonMaterialPath(path: string, courseId: string, lessonId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 4 &&
    uuidPattern.test(parts[0] ?? "") &&
    parts[1] === courseId &&
    parts[2] === lessonId &&
    uuidPattern.test(parts[3] ?? "")
  );
}

export function canChangeLesson(
  isAdmin: boolean,
  currentStatus: string,
  nextStatus = currentStatus,
): boolean {
  if (currentStatus === "draft")
    return isAdmin || nextStatus === "draft" || nextStatus === "in_review";
  if (!isAdmin) return false;
  return (
    nextStatus === currentStatus ||
    nextStatus === "draft" ||
    (currentStatus === "in_review" && nextStatus === "published")
  );
}
