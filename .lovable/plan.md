# Instructor Curriculum and Materials

## What will be built
- Add course sections and lessons inside the existing academy dashboard, with ordering and editing for assigned instructors and administrators.
- Support written lessons, video links or uploads, and downloadable learning files such as PDFs and slide decks.
- Keep uploaded materials private. Instructors can save drafts for courses assigned to them; administrators can review and publish lessons.
- Add a curriculum page linked from the administrator course list and each instructor's assigned courses.

## Implementation
- Add course-section and lesson records with database policies limiting access to administrators and instructors assigned to the course.
- Add a private course-materials storage bucket and matching policies for files under the relevant course. Validate file type, size, lesson type and editing permissions.
- Add authenticated data functions and dashboard controls for creating, ordering, editing, reviewing and deleting sections and lessons.
- Leave learner delivery gated until the learner-access choice is answered; no enrolment system exists yet.
- Preserve the public sample-course previews and add focused tests for allowed lesson types and course access.

## Out of scope
- Learner enrolments, course progress, quizzes, certificates, payments and public download links.

## Technical details
- Use existing TanStack Start authenticated routes and server functions, Lovable Cloud migrations, and private Storage with row-level security.
- Keep lesson publishing administrator-controlled; instructors may only create and edit drafts for courses assigned to their own account.