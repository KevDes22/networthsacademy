import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LearnerCourses } from "@/components/academy-learner-courses";

const read = vi.hoisted(() => vi.fn());
const certify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/academy-certification.functions", () => ({
  updateCourseCertification: certify,
}));
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
  certify.mockReset();
  certify.mockResolvedValue({ eligible: false, certificateId: null, modules: [] });
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
  it("unlocks the module quiz after completion and requests a certificate after passing", async () => {
    openCourse([
      {
        id: "module-one",
        title: "Module 1",
        description: "",
        lessons: [
          { id: "lesson", title: "Start", lesson_type: "article", article_content: "Lesson" },
        ],
      },
    ]);
    const question = { prompt: "Pick four", choices: ["4", "5", "6", "7"] };
    const quiz = { revision: "revision", passPercent: 70, questions: [question] };
    certify.mockImplementation(async ({ data }) => {
      const completed = data.operation !== "read";
      const passed = data.operation === "submit" || data.operation === "issue";
      return {
        eligible: passed,
        certificateId: data.operation === "issue" ? "certificate-id" : null,
        modules: [
          {
            sectionId: "module-one",
            completed,
            passed,
            score: passed ? 100 : null,
            quiz: completed ? quiz : null,
          },
        ],
      };
    });
    const done = await screen.findByRole("checkbox", { name: "Mark module complete" });
    expect(screen.queryByText("Pick four")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request certificate" })).toBeDisabled();
    fireEvent.click(done);
    fireEvent.click(await screen.findByRole("radio", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit quiz" }));
    const request = screen.getByRole("button", { name: "Request certificate" });
    await waitFor(() => expect(request).toBeEnabled());
    fireEvent.click(request);
    expect(await screen.findByRole("link", { name: "View certificate" })).toBeVisible();
    expect(certify.mock.calls.map(([input]) => input.data.operation)).toEqual([
      "read",
      "complete",
      "submit",
      "issue",
    ]);
  });
});
