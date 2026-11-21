# Course creation and instructor access

## Goal
Let administrators create and publish courses, grant instructor access to verified accounts, and assign one instructor to each course. Instructors can sign in and manage only the courses assigned to them.

## Build
- Add course records with title, description, category, level, instructor assignment, and draft/published status.
- Add an administrator-managed instructor list. Admins can grant instructor access to existing verified learner accounts and assign instructors to courses.
- Add a protected instructor workspace listing assigned courses and allowing course-detail edits. Instructors cannot assign themselves, change ownership, or publish; administrators control assignments and publication.
- Connect the administrator course list, search, create/edit/publish controls, and overview counts to real data.
- Show published courses in the public catalogue while keeping existing sample previews clearly labeled and separate from real courses.
- Keep lessons, media uploads, enrolments, learner progress, quizzes, certificates, and payments out of this feature.

## Security and validation
- Keep roles in the existing protected role system; validate administrator and instructor permissions on every server operation and in database policies.
- Ensure instructors can access only assigned courses, learners/public visitors see only published course details, and only administrators can assign or publish.
- Test course creation, assignment, publishing, and rejection of access to unassigned courses.

## Technical details
- Extend the existing role enum with `instructor` and add an additive course schema with explicit grants and row-level policies.
- Use authenticated TanStack server functions for private operations; use a narrow public read path for published courses.
- Add `/instructor/dashboard` and `/instructor/courses` under the existing authenticated layout, plus administrator instructor-management controls.
- Default assumption: instructors are existing verified accounts promoted by an administrator; each course has one assigned instructor.