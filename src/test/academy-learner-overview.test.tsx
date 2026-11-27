import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerOverview } from "@/components/academy-learner-overview";

const { list, certificates, progress } = vi.hoisted(() => ({
  list: vi.fn(),
  certificates: vi.fn(),
  progress: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: { course: string };
    children: ReactNode;
  }) => <a href={search ? `${to}?course=${search.course}` : to}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/lib/academy-enrollment.functions", () => ({ listMyCourses: list }));
vi.mock("@/lib/academy-certification.functions", () => ({
  listAcademyCertificates: certificates,
  updateCourseCertification: progress,
}));

function openDashboard() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LearnerOverview userId="learner-id" />
    </QueryClientProvider>,
  );
}

function stat(label: string) {
  return within(screen.getByText(label).closest(".stat") as HTMLElement);
}

beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue([]);
  certificates.mockResolvedValue([]);
});

describe("Learner dashboard", () => {
  it("shows saved enrollments, progress and certificates with direct course links", async () => {
    list.mockResolvedValue([
      { id: "analysis", title: "Data Analysis" },
      { id: "writing", title: "Writing" },
    ]);
    certificates.mockResolvedValue([{ id: "certificate" }]);
    progress.mockImplementation(async ({ data }) => ({
      eligible: data.courseId === "writing",
      certificateId: data.courseId === "writing" ? "certificate" : null,
      modules: [{ completed: true }],
    }));
    openDashboard();

    const course = await screen.findByRole("heading", { name: "Data Analysis" });
    expect(
      within(course.closest("li")!).getByRole("link", { name: "Open course" }),
    ).toHaveAttribute("href", "/dashboard/courses?course=analysis");
    expect(stat("Enrolled Courses").getByText("2")).toBeVisible();
    expect(await stat("Courses in Progress").findByText("1")).toBeVisible();
    expect(stat("Completed Courses").getByText("1")).toBeVisible();
    expect(stat("Certificates Earned").getByText("1")).toBeVisible();
  });

  it("shows an enrollment error instead of claiming the learner has no courses", async () => {
    list.mockRejectedValue(new Error("Database unavailable"));
    openDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your enrollments could not be loaded.",
    );
    expect(stat("Enrolled Courses").getByText("—")).toBeVisible();
    expect(screen.queryByText(/haven’t enrolled/)).not.toBeInTheDocument();
  });
});
