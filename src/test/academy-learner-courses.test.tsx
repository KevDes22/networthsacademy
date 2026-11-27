import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LearnerCourses } from "@/components/academy-learner-courses";

const read = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/dashboard/courses">{children}</a>
  ),
  useSearch: () => "course-id",
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/lib/academy-enrollment.functions", () => ({
  readEnrolledCourse: read,
  listMyCourses: vi.fn(),
  downloadEnrolledLessonMaterial: vi.fn(),
}));

function openCourse(sections: unknown[]) {
  read.mockResolvedValue({ title: "Data Analysis", description: "", sections });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LearnerCourses userId="learner-id" />
    </QueryClientProvider>,
  );
}

describe("Enrolled course content", () => {
  it("opens the first published lesson without a second click", async () => {
    openCourse([
      {
        id: "section",
        title: "Getting started",
        description: "",
        lessons: [
          {
            id: "first",
            title: "Introduction",
            lesson_type: "article",
            article_content: "First lesson body",
          },
          {
            id: "second",
            title: "Practice",
            lesson_type: "article",
            article_content: "Second lesson body",
          },
        ],
      },
    ]);

    expect((await screen.findByText("First lesson body")).closest("details")).toHaveAttribute(
      "open",
    );
    expect(screen.getByText("Second lesson body").closest("details")).not.toHaveAttribute("open");
  });

  it("shows enrollment succeeded when there are no published lessons", async () => {
    openCourse([]);
    expect(await screen.findByRole("status", { name: "" })).toBeInTheDocument();
    expect(
      await screen.findByText(/You’re enrolled. This course has no published lessons yet./),
    ).toBeVisible();
  });
});
