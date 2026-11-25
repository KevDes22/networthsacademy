export const lessonTypes = ['article', 'video', 'resource'] as const;
export type LessonType = (typeof lessonTypes)[number];

export const maxCurriculumFileBytes = 250 * 1024 * 1024;

export const curriculumFileTypes = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
] as const;

export const curriculumFileAccept = curriculumFileTypes.join(',');

export function isLessonType(value: string): value is LessonType {
  return lessonTypes.some((lessonType) => lessonType === value);
}

export function isSecureVideoUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateCurriculumFile(
  file: { name: string; type: string; size: number },
  lessonType?: LessonType,
): string | null {
  if (file.size < 1 || file.size > maxCurriculumFileBytes) {
    return 'Choose a file smaller than 250 MB.';
  }
  if (!curriculumFileTypes.includes(file.type as (typeof curriculumFileTypes)[number])) {
    return 'Choose a supported video, PDF, presentation, document, spreadsheet, image, audio, or text file.';
  }
  if (lessonType === 'video' && !file.type.startsWith('video/')) {
    return 'Choose a video file for this lesson.';
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
    return 'Use a secure HTTPS address for video links.';
  }
  if (input.lessonType === 'article' && input.articleContent.trim().length === 0) {
    return 'Add written lesson content before publishing.';
  }
  if (input.lessonType === 'video' && !input.videoUrl && !input.filePath) {
    return 'Add a secure video link or upload a video before publishing.';
  }
  if (input.lessonType === 'video' && input.filePath && !input.fileMimeType?.startsWith('video/')) {
    return 'Upload a video file for this lesson.';
  }
  if (input.lessonType === 'resource' && !input.filePath) {
    return 'Upload a learning file before publishing.';
  }
  return null;
}