import { createFileRoute, redirect } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { DashboardPage } from '@/components/academy-dashboard';
import { getAccount } from '@/lib/academy.functions';
import { getAssignedCourses } from '@/lib/academy-courses.functions';
import { pageHead } from '@/lib/academy';

export const Route = createFileRoute('/_authenticated/instructor/courses')({
  head: () => pageHead('Assigned Courses', 'Edit details for courses assigned to your Networths Academy instructor account.'),
  loader: async ({ context }) => {
    const account = await context.queryClient.ensureQueryData({ queryKey: ['account'], queryFn: () => getAccount() });
    if (account.isAdmin) throw redirect({ to: '/admin/dashboard' });
    if (!account.isInstructor) throw redirect({ to: '/dashboard' });
    await context.queryClient.ensureQueryData({ queryKey: ['assigned-courses'], queryFn: () => getAssignedCourses() });
    return { account };
  },
  component: Page,
});

function Page() {
  const { data: account } = useSuspenseQuery({ queryKey: ['account'], queryFn: () => getAccount() });
  return <DashboardPage account={account} view="instructor-courses" />;
}