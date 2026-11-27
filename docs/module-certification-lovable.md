# Module quizzes and certificates

Apply [the certification SQL](module-certification-lovable.sql) in Lovable’s SQL editor after the existing Academy and enrollment schema. Use a preview database where available. The GitHub branch contains the application and reference SQL. Syncing the branch alone does not create the database objects. Keep quiz, progress and certificate tables behind their authenticated functions.

## Workflow

1. An assigned instructor or administrator opens **Courses → Curriculum → Set module quiz** on a section. Add one to twenty multiple-choice questions, specify each correct answer, and set the pass mark. The editor defaults to 70%.
2. A verified enrolled learner opens the course in **My Courses**. A module is a section with at least one published lesson. Checking **Mark module complete** records self-reported completion and unlocks that module’s quiz.
3. The server grades the quiz. Failed quizzes can be retried. Save a quiz for every published module before asking students to finish the course. Editing questions or the pass mark requires a fresh pass for certificates that have yet to be issued.
4. After passing every published module, the learner selects **Request certificate**. The app issues one certificate per learner and course after verifying eligibility in the database. **Certificates** shows the saved name, course, issue date and certificate ID. The browser’s **Print or save PDF** dialog can print or save the certificate. Issued certificates retain the original learner and course names.

## Preview acceptance checks

- Verify an assigned instructor can save a quiz and an unassigned instructor cannot. Verify the learner cannot read quiz answer keys or unlock the quiz before recording module completion.
- Create two published modules with quizzes. Fail one quiz, verify the score and retry, then pass it. Confirm the certificate is still unavailable until the other module is passed.
- Request the certificate twice and confirm the same ID is returned. Open the certificate in the student dashboard and check the browser print preview.
- Sign in as a different learner and verify the first learner’s certificate is unavailable. Change a quiz after someone passes it and verify it must be retaken before issuance. Previously issued certificates remain available.
