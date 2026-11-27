import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollButton } from "@/components/academy-enroll-button";

const { navigate, enroll, getSession } = vi.hoisted(() => ({
  navigate: vi.fn(),
  enroll: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession } } }));
vi.mock("@/lib/academy-enrollment.functions", () => ({ enrollInCourse: enroll }));

function clickEnroll() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <EnrollButton courseId="data-analysis" title="Data Analysis" />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Enroll in Data Analysis" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: "student" } } }, error: null });
  enroll.mockResolvedValue({ courseId: "data-analysis" });
});
afterEach(() => vi.useRealTimers());

describe("course enrollment", () => {
  it("offers Open course even when dashboard navigation is still pending", async () => {
    navigate.mockReturnValue(new Promise(() => {}));
    clickEnroll();
    expect(await screen.findByRole("link", { name: "Open course" })).toBeVisible();
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/courses",
      search: { course: "data-analysis" },
    });
  });

  it("stops the spinner and allows a retry if the session stalls", async () => {
    vi.useFakeTimers();
    getSession.mockReturnValue(new Promise(() => {}));
    clickEnroll();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByRole("button", { name: "Enrolling in Data Analysis" })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Enrollment took too long");
    expect(screen.getByRole("button", { name: "Enroll in Data Analysis" })).toBeEnabled();
    expect(enroll).not.toHaveBeenCalled();
  });
});
