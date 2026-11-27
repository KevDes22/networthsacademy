import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Pencil,
  Plus,
  Send,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  changeCourseLessonStatus,
  createCourseLesson,
  createCourseSection,
  deleteCourseLesson,
  getCourseCurriculum,
  openCourseLessonMaterial,
  updateCourseLesson,
  updateCourseSection,
} from "@/lib/academy-curriculum.functions";
import {
  curriculumFileAccept,
  isLessonType,
  lessonPublishError,
  curriculumBucket,
  curriculumFileTypes,
  isSecureVideoUrl,
  type LessonType,
  validateCurriculumFile,
} from "@/lib/academy-curriculum";

type Curriculum = Awaited<ReturnType<typeof getCourseCurriculum>>;
type CurriculumSection = Curriculum["sections"][number];
type CurriculumLesson = CurriculumSection["lessons"][number];
type LessonStatus = "draft" | "in_review" | "published";

type SectionFormState = { title: string; description: string };
type LessonFormState = {
  title: string;
  summary: string;
  lesson_type: LessonType;
  article_content: string;
  video_url: string;
  file: File | null;
  removeFile: boolean;
};

const emptySectionForm = (): SectionFormState => ({ title: "", description: "" });
const emptyLessonForm = (): LessonFormState => ({
  title: "",
  summary: "",
  lesson_type: "article",
  article_content: "",
  video_url: "",
  file: null,
  removeFile: false,
});

export function CourseCurriculumManagement({
  courseId,
  userId,
  backTo,
}: {
  courseId: string;
  userId: string;
  backTo: "/admin/courses" | "/instructor/courses";
}) {
  const queryClient = useQueryClient();
  const queryKey = ["course-curriculum", userId, courseId];
  const curriculum = useQuery({
    queryKey,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: () => getCourseCurriculum({ data: { course_id: courseId } }),
  });
  const addSection = useServerFn(createCourseSection);
  const saveSection = useServerFn(updateCourseSection);
  const addLesson = useServerFn(createCourseLesson);
  const saveLesson = useServerFn(updateCourseLesson);
  const setLessonStatus = useServerFn(changeCourseLessonStatus);
  const removeLesson = useServerFn(deleteCourseLesson);
  const getMaterial = useServerFn(openCourseLessonMaterial);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<CurriculumSection | null>(null);
  const [sectionForm, setSectionForm] = useState<SectionFormState>(emptySectionForm);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<CurriculumSection | null>(null);
  const [editingLesson, setEditingLesson] = useState<CurriculumLesson | null>(null);
  const [lessonForm, setLessonForm] = useState<LessonFormState>(emptyLessonForm);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [preview, setPreview] = useState<CurriculumLesson | null>(null);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [material, setMaterial] = useState<{ id: string; url: string; expires: number } | null>(
    null,
  );

  function startSaving() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    return true;
  }

  function finishSaving() {
    inFlight.current = false;
    setSaving(false);
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  function openSection(section?: CurriculumSection) {
    setEditingSection(section ?? null);
    setSectionForm(
      section ? { title: section.title, description: section.description } : emptySectionForm(),
    );
    setSectionOpen(true);
  }

  async function submitSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startSaving()) return;
    try {
      if (editingSection) {
        await saveSection({ data: { id: editingSection.id, ...sectionForm } });
        toast.success("Section saved.");
      } else {
        await addSection({ data: { course_id: courseId, ...sectionForm } });
        toast.success("Section added.");
      }
      setSectionOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save this section.");
    } finally {
      finishSaving();
    }
  }

  function openLesson(section: CurriculumSection, lesson?: CurriculumLesson) {
    setShowDraftPreview(false);
    setActiveSection(section);
    setEditingLesson(lesson ?? null);
    setLessonForm(
      lesson && isLessonType(lesson.lesson_type)
        ? {
            title: lesson.title,
            summary: lesson.summary,
            lesson_type: lesson.lesson_type,
            article_content: lesson.article_content,
            video_url: lesson.video_url ?? "",
            file: null,
            removeFile: false,
          }
        : emptyLessonForm(),
    );
    setLessonOpen(true);
  }

  async function uploadFile(file: File, lessonId: string) {
    const path = `${userId}/${courseId}/${lessonId}/${crypto.randomUUID()}`;
    const result = await supabase.storage.from(curriculumBucket).upload(path, file, {
      upsert: false,
      contentType: file.type,
    });
    if (result.error)
      throw new Error(
        "The file could not be uploaded. Check the file type and size, then try again.",
      );
    return path;
  }

  async function submitLesson(status: LessonStatus) {
    if (!activeSection) return;
    if (lessonForm.file) {
      const fileError = validateCurriculumFile(lessonForm.file, lessonForm.lesson_type);
      if (fileError) {
        toast.error(fileError);
        return;
      }
    }

    const videoUrl =
      lessonForm.lesson_type === "video" ? lessonForm.video_url.trim() || null : null;
    if (videoUrl && !isSecureVideoUrl(videoUrl)) {
      toast.error("Use a secure HTTPS address for video links.");
      return;
    }

    const oldFilePath = editingLesson?.file_path ?? null;
    const filePathForCheck = lessonForm.file
      ? "pending-upload"
      : lessonForm.removeFile
        ? null
        : oldFilePath;
    const mimeTypeForCheck = lessonForm.file
      ? lessonForm.file.type
      : lessonForm.removeFile
        ? null
        : (editingLesson?.file_mime_type ?? null);
    if (status !== "draft") {
      const contentError = lessonPublishError({
        lessonType: lessonForm.lesson_type,
        articleContent: lessonForm.article_content,
        videoUrl,
        filePath: filePathForCheck,
        fileMimeType: mimeTypeForCheck,
      });
      if (contentError) {
        toast.error(contentError);
        return;
      }
    }

    if (!startSaving()) return;
    let current = editingLesson;
    try {
      if (!current) {
        current = await addLesson({
          data: {
            course_id: courseId,
            section_id: activeSection.id,
            title: lessonForm.title,
            summary: lessonForm.summary,
            lesson_type: lessonForm.lesson_type,
          },
        });
        setEditingLesson(current);
      }

      const uploadedPath = lessonForm.file ? await uploadFile(lessonForm.file, current.id) : null;
      const filePath = uploadedPath ?? (lessonForm.removeFile ? null : oldFilePath);
      const fileName =
        uploadedPath && lessonForm.file
          ? lessonForm.file.name
          : lessonForm.removeFile
            ? null
            : current.file_name;
      const fileMimeType =
        uploadedPath && lessonForm.file
          ? lessonForm.file.type
          : lessonForm.removeFile
            ? null
            : current.file_mime_type;
      const fileSizeBytes =
        uploadedPath && lessonForm.file
          ? lessonForm.file.size
          : lessonForm.removeFile
            ? null
            : current.file_size_bytes;
      const basePayload = {
        id: current.id,
        expected_updated_at: current.updated_at,
        title: lessonForm.title,
        summary: lessonForm.summary,
        lesson_type: lessonForm.lesson_type,
        article_content: lessonForm.article_content,
        video_url: videoUrl,
        file_path: filePath,
        file_name: fileName,
        file_mime_type: fileMimeType,
        file_size_bytes: fileSizeBytes,
      };

      // A lost response can follow a committed write. Leave staged and detached
      // objects for managed cleanup so neither outcome can break a live reference.
      await saveLesson({ data: { ...basePayload, status } });
      setLessonOpen(false);
      setEditingLesson(null);
      toast.success(
        status === "published"
          ? "Lesson published."
          : status === "in_review"
            ? "Lesson sent for review."
            : "Lesson saved.",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save this lesson.");
      await refresh();
    } finally {
      finishSaving();
    }
  }

  async function changeStatus(lesson: CurriculumLesson, status: LessonStatus) {
    if (!isLessonType(lesson.lesson_type)) return;
    if (!startSaving()) return;
    try {
      await setLessonStatus({
        data: { id: lesson.id, expected_updated_at: lesson.updated_at, status },
      });
      toast.success(
        status === "published"
          ? "Lesson published."
          : status === "in_review"
            ? "Lesson sent for review."
            : "Lesson moved to drafts.",
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update this lesson.");
    } finally {
      finishSaving();
    }
  }

  async function deleteLesson(lesson: CurriculumLesson) {
    if (!window.confirm(`Remove “${lesson.title}” from this course?`)) return;
    if (!startSaving()) return;
    try {
      await removeLesson({ data: { id: lesson.id, expected_updated_at: lesson.updated_at } });
      toast.success("Lesson removed.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove this lesson.");
    } finally {
      finishSaving();
    }
  }

  async function prepareMaterial(lesson: CurriculumLesson) {
    if (!startSaving()) return;
    try {
      const url = await getMaterial({ data: { id: lesson.id } });
      setMaterial({ id: lesson.id, url, expires: Date.now() + 50_000 });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "This private file could not be opened.",
      );
    } finally {
      finishSaving();
    }
  }

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="mb-5 -ml-3">
      <Link to={backTo} search={{}}>
        <ArrowLeft size={16} /> Back to courses
      </Link>
    </Button>
  );
  if (curriculum.isError || !curriculum.data) {
    return (
      <section>
        {backLink}
        {curriculum.isError ? (
          <div role="alert">
            <p>{curriculum.error.message}</p>
            <Button
              variant="outline"
              className="mt-4"
              disabled={curriculum.isFetching}
              onClick={() => void curriculum.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <p role="status">Loading curriculum…</p>
        )}
      </section>
    );
  }

  const { data } = curriculum;
  const { isAdmin } = data;
  const lessons = data.sections.flatMap((section) => section.lessons);
  const draftCount = lessons.filter((lesson) => lesson.status === "draft").length;
  const awaitingReview = lessons.filter((lesson) => lesson.status === "in_review").length;
  const publishedCount = lessons.filter((lesson) => lesson.status === "published").length;
  const saveStatus =
    editingLesson?.status === "published"
      ? "published"
      : editingLesson?.status === "in_review"
        ? "in_review"
        : "draft";

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-7">
        <div>
          {backLink}
          <p className="eyebrow text-primary mb-3">Course curriculum</p>
          <h1 className="section-title">{data.course.title}</h1>
          <p className="text-sm text-muted-foreground mt-3">
            Build ordered sections and lessons for this course.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={data.course.status === "published" ? "default" : "outline"}>
            {data.course.status === "published" ? "Catalogue published" : "Catalogue draft"}
          </Badge>
          <Button onClick={() => openSection()}>
            <Plus size={17} /> Add section
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border py-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <BookOpen size={16} /> {data.sections.length} sections
        </span>
        <span className="inline-flex items-center gap-2">
          <FileText size={16} /> {lessons.length} lessons
        </span>
        <span>{draftCount} drafts</span>
        <span className="inline-flex items-center gap-2">
          <Clock3 size={16} /> {awaitingReview} awaiting review
        </span>
        <span>{publishedCount} published lessons</span>
      </div>

      {data.sections.length === 0 ? (
        <div className="empty mt-5">
          <span className="category-icon mx-auto mb-6">
            <BookOpen size={25} />
          </span>
          <h2 className="font-display font-semibold text-lg">Start with your first section</h2>
          <p className="text-muted-foreground text-sm mt-3">
            Create a section to organize lessons, videos, and learning files.
          </p>
          <Button className="mt-6" onClick={() => openSection()}>
            <Plus size={16} /> Add section
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          {data.sections.map((section, index) => (
            <article className="border-b border-border py-7" key={section.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="category-icon shrink-0">
                      <BookOpen size={18} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-semibold">
                        Section {index + 1} · {section.title}
                      </h2>
                      {section.description && (
                        <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <IconAction
                    label="Edit section"
                    disabled={saving}
                    onClick={() => openSection(section)}
                  >
                    <Pencil size={16} />
                  </IconAction>
                </div>
              </div>

              <details open className="mt-5 ml-0 md:ml-[56px]">
                <summary className="mb-3 cursor-pointer text-sm font-medium">
                  {section.lessons.length} lessons
                </summary>
                {section.lessons.length > 0 ? (
                  <div className="divide-y divide-border border-y border-border">
                    {section.lessons.map((lesson) => (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        isAdmin={isAdmin}
                        saving={saving}
                        onEdit={() => openLesson(section, lesson)}
                        onStatus={(status) => void changeStatus(lesson, status)}
                        onDelete={() => void deleteLesson(lesson)}
                        onPreview={() => {
                          setMaterial(null);
                          setPreview(lesson);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="border-y border-border py-4 text-sm text-muted-foreground">
                    No lessons in this section yet.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => openLesson(section)}
                >
                  <Plus size={15} /> Add lesson
                </Button>
              </details>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={sectionOpen}
        onOpenChange={(open) => {
          if (!inFlight.current) setSectionOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSection ? "Edit section" : "Add a section"}</DialogTitle>
            <DialogDescription>
              Sections keep this course organized into clear learning steps.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={(event) => void submitSection(event)}>
            <label className="block text-sm font-semibold">
              Section title
              <Input
                className="mt-2"
                required
                maxLength={160}
                value={sectionForm.title}
                onChange={(event) =>
                  setSectionForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-semibold">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea
                className="mt-2 min-h-24"
                maxLength={1000}
                value={sectionForm.description}
                onChange={(event) =>
                  setSectionForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setSectionOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingSection ? "Save section" : "Add section"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={lessonOpen}
        onOpenChange={(open) => {
          if (!inFlight.current) setLessonOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingLesson ? "Edit lesson" : "Add a lesson"}</DialogTitle>
            <DialogDescription>
              {activeSection?.title ?? "Course section"} ·{" "}
              {isAdmin
                ? "Administrator review and publishing"
                : "Save a draft or submit it for review"}
            </DialogDescription>
          </DialogHeader>
          <form
            aria-busy={saving}
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              const submitter = (event.nativeEvent as SubmitEvent).submitter;
              const status = submitter?.getAttribute("value");
              void submitLesson(
                status === "published" || status === "in_review" ? status : saveStatus,
              );
            }}
          >
            <label className="block text-sm font-semibold">
              Lesson title
              <Input
                className="mt-2"
                required
                minLength={1}
                maxLength={160}
                value={lessonForm.title}
                onChange={(event) =>
                  setLessonForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-semibold">
              Short summary <span className="font-normal text-muted-foreground">(optional)</span>
              <Textarea
                className="mt-2 min-h-20"
                maxLength={1000}
                value={lessonForm.summary}
                onChange={(event) =>
                  setLessonForm((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-semibold">
              Material type
              <Select
                value={lessonForm.lesson_type}
                onValueChange={(value) => {
                  if (!isLessonType(value)) return;
                  setLessonForm((current) => ({
                    ...current,
                    lesson_type: value,
                    file: null,
                    removeFile:
                      value === "article" ||
                      (value === "video" && !editingLesson?.file_mime_type?.startsWith("video/")),
                  }));
                }}
              >
                <SelectTrigger aria-label="Material type" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="article">Written lesson</SelectItem>
                  <SelectItem value="video">Video lesson</SelectItem>
                  <SelectItem value="resource">Downloadable file</SelectItem>
                </SelectContent>
              </Select>
            </label>

            {lessonForm.lesson_type === "article" && (
              <label className="block text-sm font-semibold">
                Lesson content
                <Textarea
                  className="mt-2 min-h-48"
                  maxLength={50000}
                  placeholder="Write the lesson content here…"
                  value={lessonForm.article_content}
                  onChange={(event) =>
                    setLessonForm((current) => ({
                      ...current,
                      article_content: event.target.value,
                    }))
                  }
                />
              </label>
            )}

            {lessonForm.lesson_type === "video" && (
              <>
                <label className="block text-sm font-semibold">
                  Video link{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional if uploading a video)
                  </span>
                  <Input
                    className="mt-2"
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={lessonForm.video_url}
                    onChange={(event) =>
                      setLessonForm((current) => ({ ...current, video_url: event.target.value }))
                    }
                  />
                </label>
                <MaterialFileField
                  label="Or upload a video"
                  accept={curriculumFileTypes.filter((type) => type.startsWith("video/")).join(",")}
                  existingName={editingLesson?.file_name ?? null}
                  file={lessonForm.file}
                  removeFile={lessonForm.removeFile}
                  onFile={(file) =>
                    setLessonForm((current) => ({ ...current, file, removeFile: false }))
                  }
                  onRemove={() =>
                    setLessonForm((current) => ({ ...current, file: null, removeFile: true }))
                  }
                />
              </>
            )}

            {lessonForm.lesson_type === "resource" && (
              <MaterialFileField
                label="Learning material"
                accept={curriculumFileAccept}
                existingName={editingLesson?.file_name ?? null}
                file={lessonForm.file}
                removeFile={lessonForm.removeFile}
                onFile={(file) =>
                  setLessonForm((current) => ({ ...current, file, removeFile: false }))
                }
                onRemove={() =>
                  setLessonForm((current) => ({ ...current, file: null, removeFile: true }))
                }
              />
            )}

            <Button
              type="button"
              variant="secondary"
              aria-expanded={showDraftPreview}
              onClick={() => setShowDraftPreview(!showDraftPreview)}
            >
              Preview changes
            </Button>
            {showDraftPreview && (
              <LessonPreview
                title={lessonForm.title}
                summary={lessonForm.summary}
                lessonType={lessonForm.lesson_type}
                article={lessonForm.article_content}
                videoUrl={lessonForm.video_url.trim()}
                fileName={
                  lessonForm.file?.name ?? (lessonForm.removeFile ? null : editingLesson?.file_name)
                }
              />
            )}
            <DialogFooter className="flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setLessonOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="outline" disabled={saving}>
                {saving ? "Saving…" : saveStatus === "draft" ? "Save draft" : "Save changes"}
              </Button>
              {isAdmin && saveStatus !== "published" && (
                <Button type="submit" value="published" disabled={saving}>
                  <CheckCircle2 size={16} /> Publish lesson
                </Button>
              )}
              {!isAdmin && (
                <Button type="submit" value="in_review" disabled={saving}>
                  <Send size={16} /> Send for review
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null);
            setMaterial(null);
          }
        }}
      >
        {preview && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Lesson preview</DialogTitle>
              <DialogDescription>
                Review the saved content and its private attachment.
              </DialogDescription>
            </DialogHeader>
            <LessonPreview
              title={preview.title}
              summary={preview.summary}
              lessonType={preview.lesson_type}
              article={preview.article_content}
              videoUrl={preview.video_url}
              fileName={preview.file_name}
            />
            {preview.file_path && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {preview.file_mime_type} · {preview.file_size_bytes?.toLocaleString()} bytes
                </p>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => void prepareMaterial(preview)}
                >
                  <Download size={16} />{" "}
                  {saving ? "Preparing download…" : "Prepare private download"}
                </Button>
                {material?.id === preview.id && (
                  <a
                    className="ml-3 text-sm text-primary underline"
                    href={material.url}
                    onClick={(event) => {
                      if (Date.now() >= material.expires) {
                        event.preventDefault();
                        setMaterial(null);
                        toast.error("The link expired. Prepare a new download.");
                      }
                    }}
                  >
                    Download file
                  </a>
                )}
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function LessonRow({
  lesson,
  isAdmin,
  saving,
  onEdit,
  onStatus,
  onDelete,
  onPreview,
}: {
  lesson: CurriculumLesson;
  isAdmin: boolean;
  saving: boolean;
  onEdit: () => void;
  onStatus: (status: LessonStatus) => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const icon =
    lesson.lesson_type === "video"
      ? Video
      : lesson.lesson_type === "resource"
        ? Download
        : FileText;
  const Icon = icon;
  const canEdit = isAdmin || lesson.status === "draft";

  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <span className="category-icon h-9 w-9 shrink-0">
        <Icon size={17} />
      </span>
      <div className="min-w-[160px] flex-1">
        <p className="font-semibold">{lesson.title}</p>
        {lesson.summary && <p className="text-xs text-muted-foreground mt-1">{lesson.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LessonStatusBadge status={lesson.status} />
          {lesson.file_name && (
            <span className="max-w-[220px] truncate text-xs text-muted-foreground">
              {lesson.file_name}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" disabled={saving} onClick={onPreview}>
          Preview
        </Button>
        {canEdit && (
          <IconAction label="Edit lesson" disabled={saving} onClick={onEdit}>
            <Pencil size={15} />
          </IconAction>
        )}
        {!isAdmin && lesson.status === "draft" && (
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => onStatus("in_review")}
          >
            <Send size={14} /> Submit
          </Button>
        )}
        {isAdmin && lesson.status !== "published" && (
          <Button size="sm" disabled={saving} onClick={() => onStatus("published")}>
            <CheckCircle2 size={14} /> Publish
          </Button>
        )}
        {isAdmin && lesson.status === "published" && (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => onStatus("draft")}>
            Unpublish
          </Button>
        )}
        {isAdmin && lesson.status === "in_review" && (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => onStatus("draft")}>
            Return to draft
          </Button>
        )}
        {(isAdmin || lesson.status === "draft") && (
          <IconAction label="Delete lesson" disabled={saving} onClick={onDelete}>
            <Trash2 size={15} />
          </IconAction>
        )}
      </div>
    </div>
  );
}

function LessonPreview({
  title,
  summary,
  lessonType,
  article,
  videoUrl,
  fileName,
}: {
  title: string;
  summary: string;
  lessonType: string;
  article: string;
  videoUrl: string | null;
  fileName?: string | null | undefined;
}) {
  return (
    <div className="space-y-3 break-words rounded-md border border-border p-4">
      <h3 className="text-lg font-semibold">{title || "Untitled lesson"}</h3>
      {summary && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{summary}</p>}
      {lessonType === "article" && (
        <p className="whitespace-pre-wrap text-sm">
          {article.trim() ? article : "No article content yet."}
        </p>
      )}
      {lessonType === "video" &&
        videoUrl &&
        (isSecureVideoUrl(videoUrl) ? (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline"
          >
            Open external video
          </a>
        ) : (
          <p className="text-sm">Enter a valid HTTPS video link.</p>
        ))}
      {fileName && <p className="text-sm">{fileName}</p>}
    </div>
  );
}

function MaterialFileField({
  label,
  accept,
  existingName,
  file,
  removeFile,
  onFile,
  onRemove,
}: {
  label: string;
  accept: string;
  existingName: string | null;
  file: File | null;
  removeFile: boolean;
  onFile: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold">
        {label}
        <Input
          className="mt-2"
          type="file"
          accept={accept}
          onChange={(event) => onFile(event.currentTarget.files?.[0] ?? null)}
        />
      </label>
      <p className="text-xs text-muted-foreground mt-2">
        Videos, PDFs, presentations, documents, spreadsheets, images, audio, or text · up to 250
        MiB, subject to storage limits.
      </p>
      {file && <p className="mt-2 text-sm">Selected: {file.name}</p>}
      {!file && existingName && !removeFile && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="truncate">Current file: {existingName}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 size={14} /> Remove file
          </Button>
        </div>
      )}
      {removeFile && (
        <p className="mt-2 text-xs text-muted-foreground">
          Saving removes the file from this lesson.
        </p>
      )}
    </div>
  );
}

function IconAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function LessonStatusBadge({ status }: { status: string }) {
  if (status === "published")
    return (
      <Badge>
        <CheckCircle2 size={13} className="mr-1" /> Published
      </Badge>
    );
  if (status === "in_review")
    return (
      <Badge variant="secondary">
        <Clock3 size={13} className="mr-1" /> In review
      </Badge>
    );
  return (
    <Badge variant="outline">
      <Pencil size={12} className="mr-1" /> Draft
    </Badge>
  );
}
