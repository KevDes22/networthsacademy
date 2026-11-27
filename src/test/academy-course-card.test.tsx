import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CourseCard } from "@/components/academy-course-card";
import { categories, sampleCourses } from "@/lib/academy";
import { findPublishedPreviewCourse } from "@/lib/academy-enrollment";

vi.mock("@/components/academy-enroll-button", () => ({
  EnrollButton: ({ courseId, title }: { courseId: string; title: string }) => (
    <button data-course={courseId} aria-label={`Enroll in ${title}`}>
      Enroll
    </button>
  ),
}));

const preview = sampleCourses[0]!;
const published = {
  id: "course-id",
  title: preview.title,
  category: categories[preview.category]!.name,
  description: "Course description",
  level: preview.level,
  status: "published",
  created_at: "",
  published_at: null,
};

describe("Course card enrollment", () => {
  it("shows an Enroll button for every sample and explains why it is unavailable", () => {
    render(
      <>
        {sampleCourses.map((course) => (
          <CourseCard key={course.title} course={course} />
        ))}
      </>,
    );
    const buttons = screen.getAllByRole("button", { name: /Enroll in/ });
    expect(buttons).toHaveLength(sampleCourses.length);
    buttons.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getAllByText("Enrollment opens after publication.")).toHaveLength(buttons.length);
  });

  it("uses the actual course ID for a unique published match", () => {
    const match = findPublishedPreviewCourse(preview.title, published.category, [published]);
    render(<CourseCard course={preview} published={match} />);
    expect(screen.getByRole("button", { name: `Enroll in ${preview.title}` })).toHaveAttribute(
      "data-course",
      published.id,
    );
    expect(screen.queryByText("SAMPLE COURSE")).not.toBeInTheDocument();
  });

  it("avoids using a course from a different category or choosing between duplicates", () => {
    expect(
      findPublishedPreviewCourse(preview.title, "Other category", [published]),
    ).toBeUndefined();
    expect(
      findPublishedPreviewCourse(preview.title, published.category, [
        published,
        { ...published, id: "second" },
      ]),
    ).toBeUndefined();
  });
});
