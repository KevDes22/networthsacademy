import { createMemoryHistory, createRouter, Link, RouterProvider } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { LearnerCourses } from "@/components/academy-learner-courses";

const courseId = "00000000-0000-4000-8000-000000000002";
const { readCourse } = vi.hoisted(() => ({ readCourse: vi.fn() }));
// Use the real route tree without the document shell and its stylesheet in jsdom.
vi.mock("@/routes/__root", async () => {
  const { createRootRouteWithContext, Outlet } = await import("@tanstack/react-router");
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: () => {
      const { queryClient } = root.useRouteContext();
      return (
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
      );
    },
  });
  return { Route: root };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "student" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));
vi.mock("@/lib/academy-enrollment.functions", () => ({
  readEnrolledCourse: readCourse,
  listMyCourses: vi.fn(),
  downloadEnrolledLessonMaterial: vi.fn(),
}));
vi.mock("@/lib/academy-certification.functions", () => ({
  updateCourseCertification: async () => ({ modules: [], eligible: false, certificateId: null }),
}));
vi.mock("@/components/academy-dashboard", () => ({
  DashboardPage: ({ view }: { view: string }) => {
    if (view === "courses") return <LearnerCourses userId="student" />;
    if (view !== "dashboard") return <h1>{view}</h1>;
    return (
      <>
        <h1>Learner overview</h1>
        <Link to="/dashboard/courses" search={{ course: courseId }}>
          Open course
        </Link>
      </>
    );
  },
}));

function renderDashboard(path: string) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["account"], {
    profile: { id: "student" },
    isAdmin: false,
    isInstructor: false,
  });
  readCourse.mockResolvedValue({
    title: "Data Analysis",
    description: "Course description",
    sections: [
      {
        id: "section",
        title: "Module 1",
        description: "",
        lessons: [
          {
            id: "lesson",
            title: "Introduction",
            lesson_type: "article",
            article_content: "Lesson body",
          },
        ],
      },
    ],
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: false,
  });
  render(<RouterProvider router={router} />);
}

describe("protected learner navigation", () => {
  it("renders course content after opening a course from the learner overview", async () => {
    renderDashboard("/dashboard");
    fireEvent.click(await screen.findByRole("link", { name: "Open course" }));

    expect(await screen.findByRole("heading", { name: "Data Analysis" })).toBeVisible();
    expect(screen.getByText("Lesson body")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Learner overview" })).not.toBeInTheDocument();
    expect(readCourse).toHaveBeenCalledWith({ data: { courseId } });
  });

  it("renders course content when the course URL is opened directly", async () => {
    renderDashboard(`/dashboard/courses?course=${courseId}`);
    expect(await screen.findByRole("heading", { name: "Data Analysis" })).toBeVisible();
    expect(screen.getByText("Lesson body")).toBeVisible();
  });
  it.each(["certificates", "profile"])("renders the nested %s page", async (page) => {
    renderDashboard(`/dashboard/${page}`);
    expect(await screen.findByRole("heading", { name: page })).toBeVisible();
  });
});
