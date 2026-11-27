import { CertificateRequest, ModuleQuiz } from "@/components/academy-course-certification";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  downloadEnrolledLessonMaterial,
  listMyCourses,
  readEnrolledCourse,
} from "@/lib/academy-enrollment.functions";
import { isSecureVideoUrl } from "@/lib/academy-curriculum";

import { updateCourseCertification } from "@/lib/academy-certification.functions";

function useCourseCertification(courseId: string | undefined, userId: string, ready: boolean) {
  const action = useServerFn(updateCourseCertification);
  const client = useQueryClient();
  const queryKey = ["course-certification", userId, courseId];
  const query = useQuery({
    queryKey,
    queryFn: () => action({ data: { courseId: courseId!, operation: "read" } }),
    enabled: Boolean(courseId) && ready,
    refetchInterval: (query) =>
      query.state.data?.modules.some((module) => module.pendingReview) ? 30_000 : false,
    retry: false,
    gcTime: 0,
  });

  const change = useMutation({
    mutationFn: (data: Parameters<typeof action>[0]["data"]) => action({ data }),
    onSuccess: (data) => client.setQueryData(queryKey, data),
    onError: () => client.invalidateQueries({ queryKey }),
  });
  return { query, change };
}

export function LearnerCourses({ userId }: { userId: string }) {
  const courseId = useSearch({
    from: "/_authenticated/dashboard/courses",
    select: (search) => search.course,
  });
  const list = useServerFn(listMyCourses);
  const read = useServerFn(readEnrolledCourse);
  const courses = useQuery({
    queryKey: ["my-courses", userId],
    queryFn: () => list(),
    enabled: !courseId,
    retry: false,
  });
  const course = useQuery({
    queryKey: ["enrolled-course", userId, courseId],
    queryFn: () => read({ data: { courseId: courseId! } }),
    enabled: Boolean(courseId),
    gcTime: 0,
    retry: false,
  });
  const current = courseId ? course : courses;
  const certification = useCourseCertification(
    courseId,
    userId,
    course.isSuccess && Boolean(course.data?.sections.length),
  );
  const moduleById = new Map(
    certification.query.data?.modules.map((module) => [module.sectionId, module]),
  );
  const modules = course.data?.sections ?? [];
  const [selection, setSelection] = useState<{
    courseId: string;
    sectionId: string;
    focus: "module" | "quiz";
  } | null>(null);
  const activeSelection = selection?.courseId === courseId ? selection : null;
  const activeSectionId =
    modules.find((section) => section.id === activeSelection?.sectionId)?.id ?? modules[0]?.id;
  useEffect(() => {
    if (!activeSelection || activeSelection.sectionId !== activeSectionId) return;
    document.getElementById(`${activeSelection.focus}-${activeSectionId}`)?.focus();
  }, [activeSelection, activeSectionId]);

  return (
    <section>
      {courseId && (
        <Button asChild variant="outline" className="mb-5">
          <Link to="/dashboard/courses" search={{}}>
            Back to My Courses
          </Link>
        </Button>
      )}
      <h1 className="section-title">
        {courseId ? (course.data?.title ?? "Course") : "My Courses"}
      </h1>
      {current.isPending && (
        <p className="mt-5" role="status">
          Loading…
        </p>
      )}
      {current.isError && (
        <div className="mt-5" role="alert">
          <p>{current.error.message}</p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={current.isFetching}
            onClick={() => void current.refetch()}
          >
            Try again
          </Button>
        </div>
      )}
      {!courseId &&
        courses.isSuccess &&
        (courses.data.length ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {courses.data.map((item) => (
              <article key={item.id} className="rounded-md border border-border p-5">
                <h2 className="font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                <Button className="mt-4" asChild>
                  <Link to="/dashboard/courses" search={{ course: item.id }}>
                    Open course
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <p>You haven’t enrolled in any courses yet.</p>
            <Button className="mt-4" asChild>
              <Link to="/courses">Browse courses</Link>
            </Button>
          </div>
        ))}
      {courseId && course.isSuccess && (
        <>
          <p className="mt-4 text-muted-foreground">{course.data.description}</p>
          {modules.length === 0 && (
            <p className="mt-5 rounded-md border border-border p-4" role="status">
              You’re enrolled. This course has no published lessons yet. Check My Courses again once
              the Academy publishes them.
            </p>
          )}
          {modules.length > 1 && (
            <label className="mt-5 block max-w-md text-sm font-medium">
              Course modules
              <select
                className="field mt-2"
                value={activeSectionId}
                disabled={certification.change.isPending}
                onChange={(event) =>
                  setSelection({ courseId, sectionId: event.target.value, focus: "module" })
                }
              >
                {modules.map((section, index) => {
                  const progress = moduleById.get(section.id);
                  const status = progress?.passed
                    ? " · Quiz passed"
                    : progress?.pendingReview
                      ? " · Quiz awaiting review"
                      : progress?.completed && progress.quiz
                        ? " · Quiz ready"
                        : progress?.completed
                          ? " · Completed"
                          : "";
                  return (
                    <option key={section.id} value={section.id}>
                      {index + 1}. {section.title}
                      {status}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          <div className="mt-6 space-y-5">
            {modules.map((section, index) => {
              const module = moduleById.get(section.id);
              const next = modules[index + 1];
              return (
                <section
                  key={section.id}
                  hidden={section.id !== activeSectionId}
                  className="rounded-md border border-border p-5"
                >
                  <h2
                    id={`module-${section.id}`}
                    tabIndex={-1}
                    className="scroll-mt-6 text-lg font-semibold focus-visible:outline-primary"
                  >
                    {section.title}
                  </h2>
                  {section.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
                  )}
                  {section.lessons.map((lesson, lessonIndex) => (
                    <details
                      key={lesson.id}
                      open={lessonIndex === 0}
                      className="mt-4 border-t border-border pt-4"
                    >
                      <summary className="cursor-pointer font-medium">{lesson.title}</summary>
                      {lesson.summary && (
                        <p className="mt-3 text-sm text-muted-foreground">{lesson.summary}</p>
                      )}
                      {lesson.lesson_type === "article" && (
                        <p className="mt-3 whitespace-pre-wrap break-words">
                          {lesson.article_content}
                        </p>
                      )}
                      {lesson.lesson_type === "video" &&
                        lesson.video_url &&
                        isSecureVideoUrl(lesson.video_url) && (
                          <a
                            className="mt-3 inline-block text-primary underline"
                            href={lesson.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open video
                          </a>
                        )}
                      {lesson.file_name && (
                        <LessonDownload lessonId={lesson.id} fileName={lesson.file_name} />
                      )}
                    </details>
                  ))}
                  {module && (
                    <ModuleQuiz
                      module={module}
                      busy={certification.change.isPending}
                      quizHeadingId={`quiz-${section.id}`}
                      onComplete={() =>
                        certification.change.mutate(
                          { courseId, operation: "complete", sectionId: section.id },
                          {
                            onSuccess: (data) => {
                              if (
                                data.modules.some(
                                  (item) => item.sectionId === section.id && item.completed,
                                )
                              ) {
                                setSelection({
                                  courseId,
                                  sectionId: next?.id ?? section.id,
                                  focus: next ? "module" : "quiz",
                                });
                              }
                            },
                          },
                        )
                      }
                      onSubmit={(revision, answers) =>
                        certification.change.mutate({
                          courseId,
                          operation: "submit",
                          sectionId: section.id,
                          revision,
                          answers,
                        })
                      }
                    />
                  )}
                  {module?.completed && next && (
                    <Button
                      className="mt-4"
                      variant="outline"
                      disabled={certification.change.isPending}
                      onClick={() =>
                        setSelection({ courseId, sectionId: next.id, focus: "module" })
                      }
                    >
                      Next module
                    </Button>
                  )}
                </section>
              );
            })}
          </div>
          {certification.query.isError && (
            <div className="mt-4" role="alert">
              <p>{certification.query.error.message}</p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => void certification.query.refetch()}
              >
                Reload quiz status
              </Button>
            </div>
          )}
          {certification.change.isError && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {certification.change.error.message}
            </p>
          )}
          {certification.query.data && (
            <CertificateRequest
              eligible={certification.query.data.eligible}
              certificateId={certification.query.data.certificateId}
              busy={certification.change.isPending}
              onRequest={() => certification.change.mutate({ courseId, operation: "issue" })}
            />
          )}
        </>
      )}
    </section>
  );
}

function LessonDownload({ lessonId, fileName }: { lessonId: string; fileName: string }) {
  const sign = useServerFn(downloadEnrolledLessonMaterial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const url = await sign({ data: { lessonId } });
      window.location.assign(url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to download this file.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void download()}>
        {busy ? "Preparing download…" : `Download ${fileName}`}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
