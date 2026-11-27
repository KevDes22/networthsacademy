import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { ModuleCertification } from "@/lib/academy-certification";

export function ModuleQuiz({
  module,
  onComplete,
  onSubmit,
  busy,
}: {
  module: ModuleCertification;
  onComplete: () => void;
  onSubmit: (revision: string, answers: number[]) => void;
  busy: boolean;
}) {
  return (
    <div className="mt-5 space-y-3 border-t border-border pt-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          className="size-4 accent-primary"
          type="checkbox"
          checked={module.completed}
          disabled={busy || module.completed}
          onChange={(event) => {
            if (event.target.checked) onComplete();
          }}
        />
        Mark module complete
      </label>
      {module.completed &&
        (module.passed ? (
          <p role="status" className="text-sm font-medium text-primary">
            Quiz passed · {module.score}%
          </p>
        ) : module.quiz ? (
          <LearnerQuiz
            key={module.quiz.revision}
            quiz={module.quiz}
            busy={busy}
            onSubmit={onSubmit}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            The instructor hasn’t set this module’s quiz yet.
          </p>
        ))}
      {module.completed && !module.passed && module.score !== null && (
        <p role="status" className="text-sm">
          Score {module.score}%. Review the module and try again.
        </p>
      )}
    </div>
  );
}

function LearnerQuiz({
  quiz,
  busy,
  onSubmit,
}: {
  quiz: NonNullable<ModuleCertification["quiz"]>;
  busy: boolean;
  onSubmit: (revision: string, answers: number[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.keys(answers).length !== quiz.questions.length || busy) return;
        onSubmit(
          quiz.revision,
          quiz.questions.map((_, index) => answers[index]!),
        );
      }}
    >
      <p className="text-sm text-muted-foreground">Module quiz · Pass mark {quiz.passPercent}%</p>
      {quiz.questions.map((question, index) => (
        <fieldset key={index} disabled={busy} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 font-medium">{question.prompt}</legend>
          {question.choices.map((choice, choiceIndex) => (
            <label key={choiceIndex} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`question-${index}`}
                required
                checked={answers[index] === choiceIndex}
                className="mt-0.5 accent-primary"
                onChange={() => setAnswers({ ...answers, [index]: choiceIndex })}
              />
              {choice}
            </label>
          ))}
        </fieldset>
      ))}
      <Button
        type="submit"
        disabled={busy || Object.keys(answers).length !== quiz.questions.length}
      >
        Submit quiz
      </Button>
    </form>
  );
}

export function CertificateRequest({
  eligible,
  certificateId,
  busy,
  onRequest,
}: {
  eligible: boolean;
  certificateId: string | null;
  busy: boolean;
  onRequest: () => void;
}) {
  return (
    <section className="mt-6 rounded-md border border-border p-5">
      <h2 className="font-semibold">Course certificate</h2>
      {certificateId ? (
        <Button className="mt-3" asChild>
          <Link to="/dashboard/certificates" search={{ certificate: certificateId }}>
            View certificate
          </Link>
        </Button>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {eligible
              ? "You’ve passed every module quiz and can request your certificate."
              : "Complete and pass the quiz for each published module to request your certificate."}
          </p>
          <Button className="mt-3" disabled={busy || !eligible} onClick={onRequest}>
            {busy && eligible ? "Please wait…" : "Request certificate"}
          </Button>
        </>
      )}
    </section>
  );
}
