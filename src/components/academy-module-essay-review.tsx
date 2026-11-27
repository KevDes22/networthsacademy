import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { reviewModuleEssays } from "@/lib/academy-certification.functions";
import type { EssayReview } from "@/lib/academy-certification";

export function ModuleEssayReviews({ sectionId, userId }: { sectionId: string; userId: string }) {
  const manage = useServerFn(reviewModuleEssays);
  const queue = useQuery({
    queryKey: ["module-essay-reviews", userId, sectionId],
    queryFn: () => manage({ data: { sectionId } }),
    gcTime: 0,
    retry: false,
  });
  if (queue.isPending) return <p role="status">Loading essays…</p>;
  if (queue.isError)
    return (
      <div role="alert">
        <p>{queue.error.message}</p>
        <Button variant="outline" onClick={() => void queue.refetch()}>
          Try again
        </Button>
      </div>
    );
  return queue.data.length ? (
    <div className="space-y-4">
      {queue.data.map((review) => (
        <EssayGrade
          key={review.id}
          review={review}
          onGrade={async (grades) => {
            await manage({ data: { sectionId, review: { id: review.id, grades } } });
            await queue.refetch();
          }}
        />
      ))}
    </div>
  ) : (
    <p className="text-sm">No essays awaiting review.</p>
  );
}

function EssayGrade({
  review,
  onGrade,
}: {
  review: EssayReview;
  onGrade: (grades: boolean[]) => Promise<void>;
}) {
  const [grades, setGrades] = useState<Record<number, boolean>>({});
  const save = useMutation({ mutationFn: onGrade });
  return (
    <form
      className="space-y-3 rounded-md border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.keys(grades).length === review.essays.length) {
          save.mutate(review.essays.map((_essay, index) => grades[index]!));
        }
      }}
    >
      <h3 className="font-semibold">{review.learnerName}</h3>
      <fieldset disabled={save.isPending} className="space-y-4">
        {review.essays.map((essay, index) => (
          <div className="space-y-2" key={index}>
            <p className="font-medium">{essay.prompt}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{essay.answer}</p>
            <label className="block text-sm">
              Essay {index + 1} grade
              <select
                className="field mt-1"
                required
                value={grades[index] === undefined ? "" : String(grades[index])}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value !== "")
                    setGrades((current) => ({ ...current, [index]: value === "true" }));
                }}
              >
                <option value="" disabled>
                  Select grade
                </option>
                <option value="true">Meets requirements · 1 point</option>
                <option value="false">Needs revision · 0 points</option>
              </select>
            </label>
          </div>
        ))}
      </fieldset>
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={save.isPending || Object.keys(grades).length !== review.essays.length}
      >
        {save.isPending ? "Saving…" : "Save grades"}
      </Button>
    </form>
  );
}
