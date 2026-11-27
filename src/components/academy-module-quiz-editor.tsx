import { ModuleEssayReviews } from "@/components/academy-module-essay-review";
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

type Question = AuthoredQuiz["questions"][number];
function newQuestion(type: Question["type"] = "multiple_choice", prompt = ""): Question {
  switch (type) {
    case "fill_blank":
      return { type, prompt, accepted: [""] };
    case "essay":
      return { type, prompt };
    case "multiple_choice":
      return { type, prompt, choices: ["", "", "", ""], correct: 0 };
  }
}
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
  const [tab, setTab] = useState<"questions" | "essays">("questions");
  const manage = useServerFn(manageModuleQuiz);
  const quiz = useQuery({
    queryKey: ["manage-module-quiz", userId, sectionId],
    queryFn: () => manage({ data: { sectionId } }),
    enabled: open && tab === "questions",
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "questions" ? "default" : "outline"}
              aria-pressed={tab === "questions"}
              onClick={() => setTab("questions")}
            >
              Questions
            </Button>
            <Button
              variant={tab === "essays" ? "default" : "outline"}
              aria-pressed={tab === "essays"}
              onClick={() => setTab("essays")}
            >
              Grade essays
            </Button>
          </div>
          {open && tab === "essays" && <ModuleEssayReviews sectionId={sectionId} userId={userId} />}
          {tab === "questions" && (
            <>
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
            </>
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
      const parsed = authoredQuiz.safeParse({
        ...form,
        questions: form.questions.map((question) =>
          question.type === "fill_blank"
            ? { ...question, accepted: question.accepted.filter((answer) => answer.trim()) }
            : question,
        ),
      });
      if (!parsed.success)
        throw new Error(
          "Check the pass mark, question text and required answers for each question.",
        );
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
              Question type
              <select
                className="field mt-1"
                value={question.type}
                onChange={(event) => {
                  const type = event.target.value;
                  if (type === "multiple_choice" || type === "fill_blank" || type === "essay") {
                    editQuestion(index, newQuestion(type, question.prompt));
                  }
                }}
              >
                <option value="multiple_choice">Multiple choice</option>
                <option value="fill_blank">Fill in the blank</option>
                <option value="essay">Essay</option>
              </select>
            </label>
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
            {question.type === "multiple_choice" && (
              <>
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
              </>
            )}
            {question.type === "fill_blank" && (
              <label className="block text-sm">
                Accepted answers (one per line)
                <textarea
                  className="field mt-1 min-h-20"
                  required
                  maxLength={2010}
                  value={question.accepted.join("\n")}
                  onChange={(event) =>
                    editQuestion(index, { ...question, accepted: event.target.value.split("\n") })
                  }
                />
              </label>
            )}
            {question.type === "essay" && (
              <p className="text-sm text-muted-foreground">
                Grade this answer under Grade essays after the learner submits.
              </p>
            )}
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
