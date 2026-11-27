# Mixed module quizzes

Apply [the mixed quiz SQL](mixed-module-quizzes-lovable.sql) in Lovable after the existing enrollment and [module quiz and certificate SQL](module-certification-lovable.sql). Verify the reference migration in preview before publishing this feature. Existing multiple-choice quizzes, scores, and certificates are preserved.

In **Instructor → Assigned Courses → Curriculum → Set module quiz**, select the type for each question. A module quiz can contain up to 20 questions.

- **Multiple choice** has four options and one correct answer.
- **Fill in the blank** has up to ten accepted answers, one per line. Matching ignores letter case and normalizes whitespace.
- **Essay** accepts a written answer up to 5,000 characters. A learner’s result stays pending until the assigned instructor or an administrator marks each essay under **Grade essays**. Each question is worth one point. An essay can receive one or zero points.

While any essay on the module is pending, grade it before editing the quiz. Learners can retry failed submissions. Certificate eligibility still requires a passing result for every published module. Learners see quiz questions and their grade, while essay responses and answer keys remain scoped to the caller’s authorization.

## Preview checks

1. Save a quiz with one question of each type and enroll a verified student in the published course.
2. Mark the module complete, answer all three questions, and verify that the learner sees the pending review status and cannot request the certificate yet.
3. Open **Grade essays** as the assigned instructor. Grade the response and verify the learner’s total updates. Test a failing grade and a retake, then pass and verify certificate eligibility.
4. Check that another instructor cannot read or grade the submission and the learner cannot read the answer key.
