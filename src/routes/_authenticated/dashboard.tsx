import {createFileRoute,redirect} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {DashboardPage} from '@/components/academy-dashboard';
import {getAccount,getAdminOverview} from '@/lib/academy.functions';
import {pageHead} from '@/lib/academy';
export const Route=createFileRoute('/_authenticated/dashboard')({head:()=>pageHead('Dashboard','Your secure Networths Academy workspace.'),loader:async({context})=>{const account=await context.queryClient.ensureQueryData({queryKey:['account'],queryFn:()=>getAccount()});if(account.isAdmin)throw redirect({to:"/admin/dashboard"});return {account};},component:Page});
function Page(){const {data:account}=useSuspenseQuery({queryKey:['account'],queryFn:()=>getAccount()});return <DashboardPage account={account} view="dashboard" />}
