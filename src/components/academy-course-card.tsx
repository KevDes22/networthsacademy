import { BookOpen, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnrollButton } from "@/components/academy-enroll-button";
import { categories, type sampleCourses } from "@/lib/academy";
import type { getPublishedCourses } from "@/lib/academy-courses.functions";

type PublishedCourse = Awaited<ReturnType<typeof getPublishedCourses>>[number];

export function CourseCard({
  course,
  published,
}: {
  course: (typeof sampleCourses)[number];
  published?: PublishedCourse | undefined;
}) {
  const Icon = course.icon;
  const title = published?.title ?? course.title;
  return (
    <article className="course-card flex flex-col">
      <div className={`course-art ${course.art}`}>
        <div className="text-center">
          <Icon className="mx-auto mb-4" />
          <span className="font-display text-xs font-semibold tracking-[2px]">{course.cover}</span>
        </div>
        <span className="absolute left-3 top-3 rounded bg-card px-2 py-1 text-[10px] font-bold text-foreground">
          {published ? "PUBLISHED" : "SAMPLE COURSE"}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1px] text-primary">
          {categories[course.category]?.short}
        </p>
        <h3 className="min-h-12 text-[15px] font-semibold leading-6">{title}</h3>
        <p className="mt-2 text-xs text-muted-foreground">Networths Academy</p>
        {published ? (
          <p className="my-4 line-clamp-3 text-xs text-muted-foreground">{published.description}</p>
        ) : (
          <div className="my-4 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock3 size={13} />
              {course.hours}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen size={13} />
              {course.lessons} lessons
            </span>
          </div>
        )}
        <div className="mt-auto flex items-start justify-between gap-3 border-t border-border pt-4 text-xs">
          <span className="mt-2">{published?.level ?? course.level}</span>
          {published ? (
            <EnrollButton courseId={published.id} title={title} />
          ) : (
            <div className="text-right">
              <Button disabled variant="outline" size="sm" aria-label={`Enroll in ${title}`}>
                Enroll
              </Button>
              <p className="mt-1 text-muted-foreground">Enrollment opens after publication.</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
