import { createFileRoute, Outlet, redirect, useChildMatches } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { DashboardPage } from "@/components/academy-dashboard";
import { getAccount } from "@/lib/academy.functions";
import { pageHead } from "@/lib/academy";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Dashboard", "Your secure Networths Academy workspace."),
  loader: async ({ context }) => {
    const account = await context.queryClient.ensureQueryData({
      queryKey: ["account"],
      queryFn: () => getAccount(),
    });
    if (account.isAdmin) throw redirect({ to: "/admin/dashboard" });
    if (account.isInstructor) throw redirect({ to: "/instructor/dashboard" });
    return { account };
  },
  component: Page,
});

function Page() {
  const hasChild = useChildMatches({ select: (matches) => matches.length > 0 });
  return hasChild ? <Outlet /> : <Overview />;
}

function Overview() {
  const { data: account } = useSuspenseQuery({
    queryKey: ["account"],
    queryFn: () => getAccount(),
  });
  return <DashboardPage account={account} view="dashboard" />;
}
