import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCurriculumManagement } from "@/components/academy-curriculum-management";

const { load, save, upload, remove, toastError } = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ Link: () => <a href="/instructor/courses">Back</a> }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/lib/academy-curriculum.functions", () => ({
  getCourseCurriculum: load,
  updateCourseLesson: save,
  createCourseLesson: vi.fn(),
  createCourseSection: vi.fn(),
  updateCourseSection: vi.fn(),
  changeCourseLessonStatus: vi.fn(),
  deleteCourseLesson: vi.fn(),
  openCourseLessonMaterial: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload, remove }) } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

const userId = "00000000-0000-4000-8000-000000000001";
const courseId = "00000000-0000-4000-8000-000000000002";
const lessonId = "00000000-0000-4000-8000-000000000003";
const previousPath = `${userId}/${courseId}/${lessonId}/00000000-0000-4000-8000-000000000004`;
const lesson = {
  id: lessonId,
  title: "Workshop booklet",
  summary: "",
  status: "draft",
  lesson_type: "resource",
  article_content: "",
  video_url: null,
  updated_at: "2026-11-27T00:00:00Z",
  file_path: previousPath,
  file_name: "original.pdf",
  file_size_bytes: 64,
  file_mime_type: "application/pdf",
};

async function openEditor() {
  const queryClient = new QueryClient();
  const root = render(
    <QueryClientProvider client={queryClient}>
      <CourseCurriculumManagement
        courseId={courseId}
        userId={userId}
        backTo="/instructor/courses"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit lesson" }));
  const file = new File(["replacement"], "new.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Learning material"), { target: { files: [file] } });
  return root;
}

beforeEach(() => {
  vi.resetAllMocks();
  load.mockResolvedValue({
    course: { title: "Workshop", status: "draft" },
    isAdmin: false,
    sections: [{ id: "section", title: "Getting started", lessons: [lesson] }],
  });
});

describe("lesson editor attachment workflow", () => {
  it("prevents duplicate form submissions and preserves both objects after an ambiguous save", async () => {
    upload.mockResolvedValue({ error: null });
    let failSave!: (error: Error) => void;
    save.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          failSave = reject;
        }),
    );
    await openEditor();
    const button = screen.getByRole("button", { name: "Send for review" });
    const form = button.closest("form")!;
    const submit = () => {
      const event = new Event("submit", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "submitter", { value: button });
      fireEvent(form, event);
    };
    submit();
    submit();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(save.mock.calls[0]?.[0].data).toMatchObject({ status: "in_review" });
    expect(save.mock.calls[0]?.[0].data.file_path).not.toBe(previousPath);
    failSave(new Error("Connection lost"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Connection lost"));
    await waitFor(() => expect(button).toBeEnabled());
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Edit lesson" })).toBeInTheDocument();
  });

  it("leaves the original attachment alone when the upload fails", async () => {
    upload.mockResolvedValue({ error: "upload rejected" });
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining("could not be uploaded")),
    );
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
