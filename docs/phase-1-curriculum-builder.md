# Phase 1 curriculum builder

**Status: incomplete.** The application workflow is available on the feature branch. Safe section deletion, transactional ordering, direct database safeguards, verified hosted Storage and isolated authorisation checks are pending.

## Baseline and implementation

The baseline main commit is `d89330d`. The Lovable plan, authentication layout and middleware, authoring migrations, generated types, existing dashboards, curriculum source, and tests were inspected. The application already had the curriculum editor, course assignment, lesson types, review statuses, a composite lesson-to-section relationship, and authored RLS policies. The route tree and course pages had no curriculum entry point. The repository contained Storage object policies for `academy-course-materials`, while the bucket's deployed settings could not be verified from the versioned migration.

| Files | Change |
| --- | --- |
| `src/routes/_authenticated/{admin,instructor}.courses.tsx`, `src/components/academy-dashboard.tsx`, `src/components/academy-course-management.tsx` | UUID-valued curriculum search parameter on the existing protected routes. Links from both course tables and course-details dialogs. Back navigation uses the matching course dashboard. |
| `src/components/academy-curriculum-management.tsx` | Retryable load errors, section order/counts and collapsible lesson lists, curriculum status counts, editor and read-only previews, private download links and mutation feedback. A synchronous guard stops repeated submissions while an action is in flight. |
| `src/lib/academy-curriculum{,.functions}.ts` | Shared validation, server checks for roles and assignment, status checks and compare-and-set lesson writes. Verify the storage object and its declared metadata before attaching it. Use targeted status updates for review actions and 60-second signed downloads issued after course access checks. |
| `src/test/academy-curriculum*.test.*`, `src/test/app-routing.test.tsx` | Validation, mocked Supabase handler checks, component-level upload failure and duplicate submission checks, and protected route matching. |
| `docs/phase-1-*.md` | Audit, verification results and Lovable implementation requirements. |

Course catalogue publication remains separate from lesson publication. The preview renders article text with paragraph spacing, offers an external link for a validated HTTPS video source, and delivers private uploads using short-lived attachment downloads. The signed URL is requested on demand. The existing account, catalogue, course assignment, editing, authentication and authoring data structures are retained.

A newly created lesson starts as a draft so existing Storage policy can authorise an upload. For a replacement, the application stages a new uniquely named object and saves the content, file reference and intended status in one conditional row update. Old and staged objects are retained across failures or an unknown write outcome. Removing an attachment or deleting a lesson removes the live reference through the server without deleting the storage object. If first creation succeeds but a later step fails, the existing draft stays available for recovery. A lost response to the initial creation still needs managed idempotency for retries across requests. Existing Storage does not provide a joint SQL/object transaction.

## Security and integrity findings

| Severity | Finding | Status |
| --- | --- | --- |
| High | The prior save committed a draft before changing status and could delete a replacement already referenced by that row. Deletion could remove the object before the lesson was successfully removed. | Resolved in application flow. Managed garbage collection is pending. |
| High | Direct authenticated table writes can bypass application-only relationship guards, including reassignment between scopes an instructor already manages. The section deletion cascade can remove lessons. | Requires Lovable. Removed the application's unsafe section delete path pending restrictive FK enforcement. |
| High | Direct Storage updates and deletes can change or remove a referenced object under existing policies. Bucket privacy, size and allowed MIME settings need environment verification. | Application uses unique immutable-in-practice names, no destructive Storage writes, and short-lived signed attachment downloads. Policy changes and deployment checks remain required. |
| High | The lesson trigger primarily checks completeness at publication and has narrower path and MIME checks than the application. | Server validates both submission and publication. Database enforcement and live RLS verification require Lovable. |
| Medium | Section/lesson reorder used two independent writes. A failed or concurrent swap could produce duplicates or partial changes. | Removed unsafe reorder mutations. Transactional reorder, append serialization, and duplicate handling require a managed change. App ordering uses deterministic position, creation date and ID. |
| Medium | Concurrent lesson edits or status updates could overwrite newer work. | Compare-and-set app writes using the database-managed timestamp. End-to-end concurrency tests remain pending. |
| Medium | Persisted video links rendered without a display-time safety check. | Validate before rendering and use external navigation through a link. Article preview uses React text escaping. Uploaded files use attachment disposition. |
| Low | Hosted upload capacity and the actual MIME of file contents are unknown. | The 250 MiB application ceiling is enforced alongside the MIME allowlist. Hosted capacity and file-content safety need managed verification. |
| Informational | Supabase config uses publishable keys and a session token for curriculum requests. | Inspected environment names without printing values. No credentials or generated files were added or changed. |

## Acceptance status

| Criteria | Status |
| --- | --- |
| 1, 3–5, 7–10, 12–13 | Implemented for the application paths covered above, with automated and mocked coverage. Safe section deletion and managed object cleanup remain pending. |
| 2, 6 | Application access checks and private attachment signing implemented. Direct API enforcement still needs Lovable changes and isolated verification. |
| 11 | Read ordering is deterministic. Transactional reorder and concurrent append are pending. |
| 14 | Responsive layouts and accessible controls are implemented. Manual keyboard and viewport validation is pending. |
| 15 | Existing automated tests retained and passing. |
| 16 | Tests, type check and production build outcomes are recorded below. Repository lint remains blocked by existing formatting debt. |
| 17 | Outstanding managed work and isolated verification are specified in [Lovable database requirements](phase-1-lovable-database-requirements.md). |

## Verification commands and results

| Command | Exit | Result |
| --- | --- | --- |
| `npm_config_cache=/tmp/networths-npm npx --yes bun install --frozen-lockfile` | 0 | Locked dependencies installed. |
| `npm_config_cache=/tmp/networths-npm npx --yes bun run test` (baseline) | 0 | 9 tests across 2 files. |
| `node_modules/.bin/tsc --noEmit` (baseline) | 2 | Existing TS7030 in the curriculum editor. |
| `npm run lint` (baseline) | 1 | 1,320 errors and 7 warnings. |
| `npm run test` | 0 | 35 tests across 4 files. |
| `node_modules/.bin/tsc --noEmit` | 0 | Type check passed. |
| `npm run build` | 0 | Production build passed. Rolldown warned that code splitting takes precedence over `inlineDynamicImports`. |
| `npm run lint -- --format json` | 1 | 972 errors and 7 warnings. The shared dashboard and course-management components retain their existing formatting conventions to limit unrelated churn. |
| `node_modules/.bin/eslint src/lib/academy-curriculum{,.functions}.ts src/components/academy-curriculum-management.tsx src/routes/_authenticated/{admin,instructor}.courses.tsx src/test/{academy-curriculum.test.ts,academy-curriculum-editor.test.tsx,app-routing.test.tsx}` | 0 | Targeted curriculum checks passed. |
| `git diff --check` | 0 | Patch whitespace check passed. |

The automated access tests use a mocked Supabase client. No live RLS, deployed bucket validation, production account tests or signed-in browser acceptance were run.

## Manual acceptance on a test instance

1. Sign in as an administrator. Open Curriculum from a course row and its edit dialog. Refresh the curriculum URL and use Back to courses. Repeat the navigation with an assigned instructor. Try the same course URL as an unassigned instructor, a learner and a signed-out user.
2. Create and edit a section, collapse and reopen it, add a draft article, and preview multi-paragraph text. Try to submit whitespace-only content. Submit a complete article and confirm the instructor's editor and delete actions disappear.
3. Preview the submission as administrator. Return it to draft and confirm the assigned instructor can edit and resubmit. Publish the resubmission, unpublish it, and check that catalogue publication is displayed independently.
4. Try invalid URLs and a non-video upload for a video lesson. Verify a legitimate HTTPS video link opens externally. Attach a small permitted video or PDF, prepare its private download, test expiry, and verify an unauthorised user cannot prepare another link.
5. Interrupt an upload and simulate a failed or stale metadata save after a replacement has uploaded. Verify the previous file still downloads when the write failed. Simulate an ambiguous response and reload to see the current attachment. Try submitting the same editor twice before the first call completes.
6. Confirm lesson deletion offers confirmation and leaves sibling lessons intact. After the Lovable work is deployed, test safe section deletion, transactional reorder, and direct RLS and Storage operations using the managed verification matrix.
7. Review with a keyboard and at mobile, tablet and desktop widths. Check dialog focus, scroll, button labels, interruption feedback and slow connection behaviour.

Phase 2 depends on verified curriculum publication and material access, deterministic ordering, and an explicit learner access model tied to future enrolments. This branch does not add learner delivery.
