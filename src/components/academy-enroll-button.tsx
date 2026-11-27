import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
      const session = await supabase.auth.getSession();
      if (session.error) throw new Error("Could not check your session. Please try again.");
      if (!session.data.session) {
        await navigate({ to: "/signup", search: { enroll: courseId } });
        return;
      }
      await enroll({ data: { courseId } });
      await queryClient.invalidateQueries({
        queryKey: ["my-courses", session.data.session.user.id],
      });
      await navigate({ to: "/dashboard/courses", search: { course: courseId } });
    },
  });

  return (
    <div className="text-right">
      <Button
        size="sm"
        aria-label={enrollment.isPending ? `Enrolling in ${title}` : `Enroll in ${title}`}
        disabled={enrollment.isPending}
        onClick={() => enrollment.mutate()}
      >
        {enrollment.isPending ? "Enrolling…" : "Enroll"}
      </Button>
      {enrollment.isError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {enrollment.error.message}
        </p>
      )}
    </div>
  );
}
