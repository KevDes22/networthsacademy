import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { enrollInCourse } from "@/lib/academy-enrollment.functions";

export function EnrollButton({ courseId, title }: { courseId: string; title: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enroll = useServerFn(enrollInCourse);
  const enrollment = useMutation({
    mutationFn: async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const saveEnrollment = async () => {
        const session = await supabase.auth.getSession();
        controller.signal.throwIfAborted();
        if (session.error) throw new Error("Could not check your session. Please try again.");
        if (!session.data.session) return { kind: "signup" } as const;
        await enroll({ data: { courseId }, signal: controller.signal });
        return { kind: "enrolled", userId: session.data.session.user.id } as const;
      };
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Enrollment took too long. Check My Courses or try again."));
          controller.abort();
        }, 15_000);
      });
      try {
        return await Promise.race([saveEnrollment(), deadline]);
      } finally {
        clearTimeout(timer);
      }
    },
    onSuccess: (result) => {
      if (result.kind === "signup") {
        void navigate({ to: "/signup", search: { enroll: courseId } });
        return;
      }
      // Opening the course only needs the completed enrollment, not a refreshed list.
      void queryClient.invalidateQueries({
        queryKey: ["my-courses", result.userId],
        refetchType: "none",
      });
      void navigate({ to: "/dashboard/courses", search: { course: courseId } });
    },
  });

  return (
    <div className="text-right">
      {enrollment.data?.kind === "enrolled" ? (
        <Button size="sm" asChild>
          <Link to="/dashboard/courses" search={{ course: courseId }}>
            Open course
          </Link>
        </Button>
      ) : (
        <Button
          size="sm"
          aria-label={enrollment.isPending ? `Enrolling in ${title}` : `Enroll in ${title}`}
          disabled={enrollment.isPending}
          onClick={() => enrollment.mutate()}
        >
          {enrollment.isPending ? "Enrolling…" : "Enroll"}
        </Button>
      )}
      {enrollment.isError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {enrollment.error.message}
        </p>
      )}
    </div>
  );
}
