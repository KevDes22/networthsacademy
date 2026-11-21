import {createFileRoute,redirect} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {DashboardPage} from '@/components/academy-dashboard';
import {getAccount,getAdminOverview} from '@/lib/academy.functions';
import {getAdminCourses,getInstructorDirectory} from '@/lib/academy-courses.functions';
import {pageHead} from '@/lib/academy';
export const Route=createFileRoute('/_authenticated/admin/courses')({head:()=>pageHead('Course Management','Create courses, assign instructors and publish courses in Networths Academy.'),loader:async({context})=>{const account=await context.queryClient.ensureQueryData({queryKey:['account'],queryFn:()=>getAccount()});if(!account.isAdmin)throw redirect({to:"/dashboard"});const adminData=await context.queryClient.ensureQueryData({queryKey:['admin-overview'],queryFn:()=>getAdminOverview()});await Promise.all([context.queryClient.ensureQueryData({queryKey:['admin-courses'],queryFn:()=>getAdminCourses()}),context.queryClient.ensureQueryData({queryKey:['instructor-directory'],queryFn:()=>getInstructorDirectory()})]);return {account,adminData};},component:Page});
function Page(){const {data:account}=useSuspenseQuery({queryKey:['account'],queryFn:()=>getAccount()});const {data:adminData}=useSuspenseQuery({queryKey:["admin-overview"],queryFn:()=>getAdminOverview()});return <DashboardPage account={account} view="courses" adminData={adminData}/>}
