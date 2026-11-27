import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { manageModuleQuiz } from "@/lib/academy-certification.functions";
import { authoredQuiz, type AuthoredQuiz } from "@/lib/academy-certification";

const newQuestion = () => ({ prompt: "", choices: ["", "", "", ""], correct: 0 });

export function ModuleQuizEditor({
  sectionId,
  title,
  userId,
}: {
  sectionId: string;
  title: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const manage = useServerFn(manageModuleQuiz);
  const quiz = useQuery({
    queryKey: ["manage-module-quiz", userId, sectionId],
    queryFn: () => manage({ data: { sectionId } }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Set module quiz
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quiz for {title}</DialogTitle>
            <DialogDescription>
              Learners can start the quiz after marking this module complete. Changing a quiz
              requires learners without a certificate to pass the updated quiz before requesting
              one.
            </DialogDescription>
          </DialogHeader>
          {quiz.isPending && <p role="status">Loading quiz…</p>}
          {quiz.isError && (
            <div role="alert">
              <p>{quiz.error.message}</p>
              <Button variant="outline" onClick={() => void quiz.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {open && quiz.isSuccess && (
            <QuizForm
              initial={quiz.data}
              onSave={async (data) => {
                await manage({ data: { sectionId, quiz: data } });
                setOpen(false);
                void quiz.refetch();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuizForm({
  initial,
  onSave,
}: {
  initial: AuthoredQuiz | null;
  onSave: (quiz: AuthoredQuiz) => Promise<void>;
}) {
  const [form, setForm] = useState<AuthoredQuiz>(
    () => initial ?? { passPercent: 70, questions: [newQuestion()] },
  );
  const save = useMutation({
    mutationFn: async () => {
      const parsed = authoredQuiz.safeParse(form);
      if (!parsed.success)
        throw new Error("Enter a pass mark, each question and all four answers.");
      await onSave(parsed.data);
    },
  });
  function editQuestion(index: number, question: AuthoredQuiz["questions"][number]) {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((item, position) => (position === index ? question : item)),
    }));
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <fieldset disabled={save.isPending} className="space-y-4">
        <label className="block text-sm font-medium">
          Pass mark (%)
          <Input
            className="mt-1 max-w-28"
            type="number"
            min={1}
            max={100}
            required
            value={form.passPercent || ""}
            onChange={(event) => setForm({ ...form, passPercent: event.target.valueAsNumber })}
          />
        </label>
        {form.questions.map((question, index) => (
          <fieldset key={index} className="space-y-3 rounded-md border p-3">
            <legend className="px-1 font-medium">Question {index + 1}</legend>
            <label className="block text-sm">
              Question
              <Input
                className="mt-1"
                required
                maxLength={500}
                value={question.prompt}
                onChange={(event) =>
                  editQuestion(index, { ...question, prompt: event.target.value })
                }
              />
            </label>
            {question.choices.map((choice, choiceIndex) => (
              <label key={choiceIndex} className="block text-sm">
                Answer {choiceIndex + 1}
                <Input
                  className="mt-1"
                  required
                  maxLength={200}
                  value={choice}
                  onChange={(event) =>
                    editQuestion(index, {
                      ...question,
                      choices: question.choices.map((value, position) =>
                        position === choiceIndex ? event.target.value : value,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label className="block text-sm">
              Correct answer
              <select
                className="field mt-1"
                value={question.correct}
                onChange={(event) =>
                  editQuestion(index, { ...question, correct: Number(event.target.value) })
                }
              >
                {question.choices.map((_, choiceIndex) => (
                  <option key={choiceIndex} value={choiceIndex}>
                    Answer {choiceIndex + 1}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={form.questions.length === 1}
              onClick={() =>
                setForm({
                  ...form,
                  questions: form.questions.filter((_, position) => position !== index),
                })
              }
            >
              Remove question
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={form.questions.length >= 20}
          onClick={() => setForm({ ...form, questions: [...form.questions, newQuestion()] })}
        >
          Add question
        </Button>
      </fieldset>
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save quiz"}
      </Button>
    </form>
  );
}
