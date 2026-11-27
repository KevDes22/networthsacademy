import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { DashboardPage } from "@/components/academy-dashboard";
import { getAccount } from "@/lib/academy.functions";
import { pageHead } from "@/lib/academy";
export const Route = createFileRoute("/_authenticated/dashboard/courses")({
  validateSearch: z.object({ course: z.string().uuid().optional().catch(undefined) }),
  head: () => pageHead("My Courses", "Your secure Networths Academy workspace."),
  loader: async ({ context }) => {
    const account = await context.queryClient.ensureQueryData({
      queryKey: ["account"],
      queryFn: () => getAccount(),
    });
    return { account };
  },
  component: Page,
});
function Page() {
  const { data: account } = useSuspenseQuery({
    queryKey: ["account"],
    queryFn: () => getAccount(),
  });
  return <DashboardPage account={account} view="courses" />;
}
