import {createFileRoute,redirect} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {DashboardPage} from '@/components/academy-dashboard';
import {getAccount,getAdminOverview} from '@/lib/academy.functions';
import {pageHead} from '@/lib/academy';
export const Route=createFileRoute('/_authenticated/dashboard/profile')({head:()=>pageHead('My Profile','Your secure Networths Academy workspace.'),loader:async({context})=>{const account=await context.queryClient.ensureQueryData({queryKey:['account'],queryFn:()=>getAccount()});return {account};},component:Page});
function Page(){const {data:account}=useSuspenseQuery({queryKey:['account'],queryFn:()=>getAccount()});return <DashboardPage account={account} view="profile" />}
