import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CheckCircle2, GraduationCap, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyCourses } from "@/lib/academy-enrollment.functions";
import {
  listAcademyCertificates,
  updateCourseCertification,
} from "@/lib/academy-certification.functions";

export function LearnerOverview({ userId }: { userId: string }) {
  const list = useServerFn(listMyCourses);
  const listCertificates = useServerFn(listAcademyCertificates);
  const readProgress = useServerFn(updateCourseCertification);
  const courses = useQuery({
    queryKey: ["my-courses", userId],
    queryFn: () => list(),
    retry: false,
  });
  const certificates = useQuery({
    queryKey: ["academy-certificates", userId],
    queryFn: () => listCertificates(),
    gcTime: 0,
    retry: false,
  });
  const progress = useQueries({
    queries: (courses.isSuccess ? courses.data : []).map(({ id }) => ({
      queryKey: ["course-certification", userId, id],
      queryFn: () => readProgress({ data: { courseId: id, operation: "read" } }),
      gcTime: 0,
      retry: false,
    })),
  });
  const progressReady = courses.isSuccess && progress.every((item) => item.isSuccess);
  const completed = progress.filter(({ data }) => data?.eligible || data?.certificateId).length;
  const inProgress = progress.filter(
    ({ data }) =>
      data &&
      !data.eligible &&
      !data.certificateId &&
      data.modules.some((module) => module.completed),
  ).length;
  const stats = [
    {
      label: "Enrolled Courses",
      value: courses.isSuccess ? courses.data.length : null,
      icon: BookOpen,
    },
    {
      label: "Courses in Progress",
      value: progressReady ? inProgress : null,
      icon: LayoutDashboard,
    },
    { label: "Completed Courses", value: progressReady ? completed : null, icon: CheckCircle2 },
    {
      label: "Certificates Earned",
      value: certificates.isSuccess ? certificates.data.length : null,
      icon: GraduationCap,
    },
  ];

  return (
    <>
      <div className="my-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div className="stat" key={label}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Icon size={20} className="text-primary" aria-hidden="true" />
            </div>
            <p className="mt-5 font-display text-3xl font-semibold">{value ?? "—"}</p>
          </div>
        ))}
      </div>
      {(certificates.isError || progress.some((item) => item.isError)) && (
        <p className="mb-5 text-sm text-muted-foreground" role="status">
          Some learning totals are unavailable right now.
        </p>
      )}
      <section aria-labelledby="my-learning-heading">
        <h2 id="my-learning-heading" className="mb-5 text-lg font-semibold">
          My learning
        </h2>
        {courses.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your courses…
          </p>
        )}
        {courses.isError && (
          <div role="alert" className="rounded-md border border-border p-5">
            <p>Your enrollments could not be loaded.</p>
            <Button
              variant="outline"
              className="mt-3"
              disabled={courses.isFetching}
              onClick={() => void courses.refetch()}
            >
              Try again
            </Button>
          </div>
        )}
        {courses.isSuccess &&
          (courses.data.length ? (
            <ul className="space-y-3 border-t border-border pt-4">
              {courses.data.map((course) => (
                <li
                  key={course.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4"
                >
                  <h3 className="font-semibold">{course.title}</h3>
                  <Button asChild variant="outline">
                    <Link to="/dashboard/courses" search={{ course: course.id }}>
                      Open course
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-border pt-4">
              <p>You haven’t enrolled in any courses yet.</p>
              <Button asChild className="mt-3">
                <Link to="/courses">Browse courses</Link>
              </Button>
            </div>
          ))}
      </section>
    </>
  );
}
