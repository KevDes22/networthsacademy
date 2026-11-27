import { LearnerCourses } from './academy-learner-courses';
import { CourseCurriculumManagement } from './academy-curriculum-management';
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from './academy-public';
import { AdminCourseManagement, InstructorCourseManagement, InstructorManagement, InstructorOverview } from './academy-course-management';
import { supabase } from '@/integrations/supabase/client';
import { approveAdmin, getAccount, getAdminOverview, updateProfile } from '@/lib/academy.functions';

type Account = Awaited<ReturnType<typeof getAccount>>;
type AdminData = Awaited<ReturnType<typeof getAdminOverview>>;

const learnerLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/courses', label: 'My Courses', icon: BookOpen },
  { to: '/dashboard/certificates', label: 'Certificates', icon: GraduationCap },
  { to: '/dashboard/profile', label: 'My Profile', icon: UserRound },
] as const;
const instructorLinks = [
  { to: '/instructor/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/instructor/courses', label: 'Assigned Courses', icon: BookOpen },
  { to: '/dashboard/profile', label: 'My Profile', icon: UserRound },
] as const;
const adminLinks = [
  { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen },
  { to: '/admin/learners', label: 'Learners', icon: Users },
  { to: '/admin/instructors', label: 'Instructors', icon: BriefcaseBusiness },
  { to: '/admin/administrators', label: 'Administrators', icon: ShieldCheck },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
] as const;

export function DashboardPage({ account, view, adminData, curriculumId }: { account: Account; view: string; adminData?: AdminData; curriculumId?: string | undefined }) {
  const admin = account.isAdmin;
  const instructor = !admin && account.isInstructor;
  const nav = admin ? adminLinks : instructor ? instructorLinks : learnerLinks;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState(account.profile.full_name);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const save = useServerFn(updateProfile);
  const approve = useServerFn(approveAdmin);

  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: '/login', replace: true });
  }

  async function saveName() {
    setSaving(true);
    try {
      await save({ data: { full_name: name } });
      await queryClient.invalidateQueries();
      toast.success('Your profile has been updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setSaving(false);
    }
  }

  async function grantAdmin(id: string) {
    if (!window.confirm('Approve this verified learner as an administrator? They will have access to all learner information.')) return;
    try {
      await approve({ data: { target_id: id } });
      await queryClient.invalidateQueries();
      toast.success('Administrator approved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to approve administrator.');
    }
  }

  const adminIds = new Set(adminData?.roles.filter((role) => role.role === 'admin').map((role) => role.user_id));
  const instructorIds = new Set(adminData?.roles.filter((role) => role.role === 'instructor').map((role) => role.user_id));
  const rows = adminData?.profiles.filter((profile) => {
    const isShown = view === 'administrators'
      ? adminIds.has(profile.id)
      : view === 'learners'
        ? !adminIds.has(profile.id) && !instructorIds.has(profile.id)
        : false;
    return isShown && `${profile.full_name} ${profile.email}`.toLowerCase().includes(query.toLowerCase());
  }) ?? [];

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand />
        <div className="flex justify-between items-center mt-8 mb-5">
          <p className="eyebrow text-muted-foreground">{admin ? 'Administration' : instructor ? 'Instructor workspace' : 'Learner workspace'}</p>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X /></Button>
        </div>
        <nav className="space-y-2">
          {nav.map((item) => <Link key={item.to} to={item.to} activeOptions={{ exact: true }} className="dash-link" activeProps={{ className: 'dash-link active' }} onClick={() => setOpen(false)}>
            <item.icon size={18} />{item.label}
          </Link>)}
        </nav>
        <div className="absolute bottom-8 left-5 right-5 border-t border-border pt-4">
          <Button variant="ghost" className="w-full justify-start" onClick={() => void logout()}><LogOut />Logout</Button>
          <Link to="/" className="block text-xs text-muted-foreground pl-4 mt-4">← Back to Academy</Link>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="flex justify-between items-center gap-4 border-b border-border pb-6 mb-9">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="md:hidden" aria-label="Open dashboard menu" onClick={() => setOpen(true)}><Menu /></Button>
            <span className="text-sm text-muted-foreground">{admin ? 'Academy management' : instructor ? 'Teaching space' : 'Your learning space'}</span>
          </div>
          <span className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline">{account.profile.full_name || 'Learner'}</span>
            <span className="w-9 h-9 rounded-full bg-accent text-primary grid place-items-center font-bold">{(account.profile.full_name || 'L').slice(0, 1).toUpperCase()}</span>
          </span>
        </header>

        {(view === 'dashboard' || view === 'overview') && <>
          <p className="eyebrow text-primary mb-3">{admin ? 'Academy overview' : 'A fresh start'}</p>
          <h1 className="section-title">{admin ? 'Academy at a glance' : `Welcome, ${account.profile.full_name.split(' ')[0] || 'Learner'} 👋`}</h1>
          <p className="text-muted-foreground mt-3 text-sm">{admin ? 'Manage your academy and its growing community.' : 'Your next chapter is waiting. Let’s make it a meaningful one.'}</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 my-8">
            {(admin
              ? [
                  ['Registered Learners', adminData?.learners ?? 0, Users],
                  ['Administrators', adminData?.administrators ?? 0, ShieldCheck],
                  ['Instructors', adminData?.instructors ?? 0, BriefcaseBusiness],
                  ['Total Courses', adminData?.courses ?? 0, BookOpen],
                  ['Published Courses', adminData?.publishedCourses ?? 0, CheckCircle2],
                ]
              : [
                  ['Enrolled Courses', 0, BookOpen],
                  ['Courses in Progress', 0, LayoutDashboard],
                  ['Completed Courses', 0, CheckCircle2],
                  ['Certificates Earned', 0, GraduationCap],
                ]).map(([label, count, Icon]) => {
              const IconComponent = Icon as typeof BookOpen;
              return <div className="stat" key={String(label)}>
                <div className="flex justify-between items-center"><p className="text-sm text-muted-foreground">{String(label)}</p><IconComponent size={20} className="text-primary" /></div>
                <p className="text-3xl font-display font-semibold mt-5">{String(count)}</p>
              </div>;
            })}
          </div>
          {admin ? <section className="border-y border-border py-6 flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-lg font-semibold">Course management</h2><p className="text-sm text-muted-foreground mt-1">Create courses, assign instructors, and publish them to the catalogue.</p></div>
            <Button asChild><Link to="/admin/courses">Manage courses <ArrowRight size={16} /></Link></Button>
          </section> : <>
            <h2 className="text-lg font-semibold mb-5">My learning</h2>
            <Empty icon={BookOpen} title="You haven't enrolled in any courses yet." text="Explore the learning paths coming to Networths Academy." browse />
          </>}
        </>}

        {view === 'instructor-dashboard' && instructor && <InstructorOverview />}
        {view === 'courses' && admin && (curriculumId
          ? <CourseCurriculumManagement key={curriculumId} courseId={curriculumId} userId={account.profile.id} backTo="/admin/courses" />
          : <AdminCourseManagement />)}
        {view === 'courses' && !admin && !instructor && <LearnerCourses userId={account.profile.id} />}
        {view === 'instructor-courses' && instructor && (curriculumId
          ? <CourseCurriculumManagement key={curriculumId} courseId={curriculumId} userId={account.profile.id} backTo="/instructor/courses" />
          : <InstructorCourseManagement />)}
        {view === 'instructors' && admin && <InstructorManagement />}

        {view === 'certificates' && <>
          <h1 className="section-title">Certificates</h1>
          <p className="text-sm text-muted-foreground mt-3 mb-8">Your achievements will live here.</p>
          <Empty icon={GraduationCap} title="No certificates yet" text="Certificates will become available when learning and course completion launch." browse />
        </>}

        {(view === 'profile' || view === 'settings') && <>
          <h1 className="section-title">{admin ? 'Settings' : 'My Profile'}</h1>
          <p className="text-sm text-muted-foreground mt-3 mb-8">Your account details and preferences.</p>
          <form className="max-w-xl space-y-6" onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
            <label className="block text-sm font-semibold">Full name<Input className="mt-2" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="block text-sm font-semibold">Email address<Input className="mt-2" disabled value={account.profile.email} /></label>
            <div><p className="text-sm font-semibold">Account role</p><span className="inline-block mt-3 bg-accent text-accent-foreground px-3 py-1 rounded text-xs font-semibold">{admin ? 'Administrator' : instructor ? 'Instructor' : 'Learner'}</span></div>
            <Button disabled={saving} type="submit">{saving ? 'Saving…' : 'Save Changes'}</Button>
          </form>
          {admin && <section className="mt-12 border-t border-border pt-8 max-w-xl"><h2 className="text-xl font-semibold">Academy settings</h2><p className="text-sm mt-4">Networths Academy</p><p className="text-sm text-muted-foreground mt-2">Operated by Networths Professional Services Foundation</p><p className="text-xs text-muted-foreground mt-5">Additional academy settings are coming in a future phase.</p></section>}
        </>}

        {(view === 'learners' || view === 'administrators') && <>
          <h1 className="section-title">{view === 'learners' ? 'Learners' : 'Administrators'}</h1>
          <p className="text-sm text-muted-foreground mt-3">{view === 'learners' ? 'Registered learner accounts.' : 'Authorised administrators. Approve a verified learner to add an administrator.'}</p>
          <div className="relative max-w-md mt-7"><Search size={18} className="absolute left-3 top-3.5 text-muted-foreground" /><Input className="pl-10" aria-label="Search accounts" placeholder="Search by name or email" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="overflow-x-auto mt-8">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border"><tr>{['Full name', 'Email', 'Registered', 'Account status', ...(view === 'learners' ? ['Actions'] : [])].map((heading) => <th className="py-4 px-3 font-medium" key={heading}>{heading}</th>)}</tr></thead>
              <tbody>{rows.map((profile) => <tr key={profile.id} className="border-b border-border">
                <td className="py-5 px-3 whitespace-nowrap">{profile.full_name || 'Not provided'}</td>
                <td className="px-3">{profile.email}</td>
                <td className="px-3 whitespace-nowrap">{new Date(profile.created_at).toLocaleDateString()}</td>
                <td className="px-3"><span className="text-xs text-primary">Registered</span></td>
                {view === 'learners' && <td className="px-3"><Button variant="outline" size="sm" onClick={() => void grantAdmin(profile.id)}>Approve Admin</Button></td>}
              </tr>)}</tbody>
            </table>
          </div>
          {rows.length === 0 && <Empty icon={Users} title="No accounts found" text="Accounts matching your search will appear here." />}
          {(adminData?.profiles.length ?? 0) >= 1000 && <p className="text-sm text-muted-foreground mt-4">Showing the newest 1,000 accounts.</p>}
        </>}
      </main>
    </>
  );
}

function Empty({ icon: Icon, title, text, browse = false }: { icon: typeof BookOpen; title: string; text: string; browse?: boolean }) {
  return <div className="empty">
    <span className="category-icon mx-auto mb-6"><Icon size={26} /></span>
    <h2 className="font-display font-semibold text-lg">{title}</h2>
    <p className="text-muted-foreground text-sm mt-3 max-w-lg mx-auto leading-6">{text}</p>
    {browse && <Button className="mt-6" asChild><Link to="/courses">Explore Courses <ArrowRight /></Link></Button>}
  </div>;
}