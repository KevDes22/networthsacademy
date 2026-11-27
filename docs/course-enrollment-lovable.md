# Activate course enrollment in Lovable

The feature branch adds Enroll to published course cards and uses the following database contract. Until Lovable applies it, the app can carry a selected course through account creation and sign-in, but the enrollment request will report that enrollment is unavailable.

## Apply through Lovable

Use [the complete enrollment SQL](course-enrollment-lovable.sql) as the source for a Lovable-managed migration. Apply it to a preview database first, after the existing Academy migrations. Confirm that the private `academy-course-materials` bucket exists and that the migration owner can read `auth.users` and create policies on `storage.objects`. Run the acceptance checks below before applying to the live project. Lovable should generate and sync the migration and database types.

## Lovable implementation prompt

Create the enrollment schema and authenticated functions through Lovable's managed database workflow. Keep course and lesson authoring policies in place. Add an isolated test environment for the acceptance checks.

- Create `public.course_enrollments` with `learner_id uuid` referencing `auth.users(id)`, `course_id uuid` referencing `public.courses(id)`, and `enrolled_at timestamptz not null default now()`. Remove enrollment rows when their account or course is deleted. Use the learner/course pair as the primary key, so repeated requests and concurrent requests leave one row. Enable RLS. Grant no direct insert, update, or delete to authenticated or anonymous roles. Keep unauthenticated and cross-account reads denied. Add a course-first index for administrative joins or cascade checks if needed.
- Add `public.enroll_in_course(course_uuid uuid) returns boolean`. Require a verified signed-in account with the learner role and without instructor or administrator privileges, consistent with the learner dashboard. Identify the account through `auth.uid()`; never accept a caller-selected learner ID. Lock the course row for the status check so a concurrent unpublish and enrollment serialize. Require a published course, insert the pair with conflict-do-nothing, and return true for both a new enrollment and an existing enrollment in a published course.
- Add `public.list_my_courses() returns jsonb`. Apply the same caller checks. Return an array of the caller's enrolled and currently published courses with `id`, `title`, and `description`. Use an empty array for zero results and sort by enrollment date descending with ID as a stable tie-breaker.
- Add `public.read_enrolled_course(course_uuid uuid) returns jsonb`. Apply the same caller checks and require an enrollment in the currently published course. Return the course summary fields and a `sections` array. Each section contains `id`, `title`, `description`, and `lessons`. Only include sections with published lessons. Lessons contain `id`, `title`, `summary`, `lesson_type`, `article_content`, nullable `video_url`, and nullable `file_name`. Sort sections and lessons by position, creation time, and ID. Use empty arrays where appropriate. Keep draft/review rows, authorship fields, and file paths out of the response. Use uniform denial for unpublished, inaccessible and missing courses.
- Add `public.get_enrolled_lesson_material(lesson_uuid uuid) returns jsonb`. Apply the same caller checks and require a published lesson in a currently published course in which the caller is enrolled. Return `course_id`, `file_path`, and `file_name` only for a current attachment. Return a uniform denial for missing or inaccessible materials.
- Keep the Storage bucket private. Add a narrowly scoped SELECT policy for enrolled learners using the exact path of the current attached object, matching course and lesson IDs. Require a published lesson, a published course and an active enrollment. Do not grant learner INSERT, UPDATE, or DELETE. Keep existing authoring policies. The application requests a 60-second signed attachment download after authorisation.
- For privileged functions required to reach protected rows, use least privilege, a fixed search path, schema-qualified identifiers, explicit caller checks, and narrowly scoped output. Revoke EXECUTE from PUBLIC and anon, and grant it to authenticated. Avoid granting learners direct access to authoring tables.
- Verify the Academy site's Supabase Auth redirect allowlist accepts the existing `/login` destination with the UUID-valued `enroll` query parameter. Verify the same on the isolated preview domain. Confirm the email confirmation flow retains the selected course.

## Test before release

Use a new verified learner, a second learner, and an administrator in the test environment. Publish a test course with one published and one draft lesson. Start from the public Enroll button with a signed-out browser, create and confirm an account, and verify that the browser returns to the selected course. Enroll, open the course from My Courses, and confirm only the published lesson is visible. Repeat enrollment and confirm there is still one row. Check that learner B cannot open learner A's enrolled course without their own enrollment. Check that unpublishing the course or lesson removes access, including access to new signed downloads. Check that a sample preview provides no enrollment action.

Existing signed download links remain valid until expiry. Unpublishing prevents new links from being issued.

## Local database verification

The SQL was applied after the existing Academy migrations in isolated PostgreSQL using PGlite with local Auth and Storage fixtures. Checks passed for repeated enrollment, unpublished course rejection, account and role restrictions, draft lesson filtering, exact-path Storage reads, and denial after unpublishing. Hosted Supabase Auth, signed URL issuance, and Lovable deployment still require preview verification.
