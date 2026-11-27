import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/academy-auth";
import { enrollmentSearch } from "@/lib/academy-enrollment";
import { pageHead } from "@/lib/academy";
export const Route = createFileRoute("/signup")({
  validateSearch: enrollmentSearch,
  head: () =>
    pageHead(
      "Create Your Account",
      "Secure account access for Networths Academy learners and administrators.",
    ),
  component: Page,
});

function Page() {
  const { enroll } = Route.useSearch();
  return <AuthPage mode="signup" enroll={{ courseId: enroll }} />;
}
