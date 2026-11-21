import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { approveInstructor } from '@/lib/academy.functions';
import {
  createCourse,
  getAdminCourses,
  getAssignedCourses,
  getInstructorCandidates,
  getInstructorDirectory,
  updateAdminCourse,
  updateAssignedCourse,
} from '@/lib/academy-courses.functions';
import { categories } from '@/lib/academy';

type AdminCourse = Awaited<ReturnType<typeof getAdminCourses>>[number];
type AssignedCourse = Awaited<ReturnType<typeof getAssignedCourses>>[number];
type Instructor = Awaited<ReturnType<typeof getInstructorDirectory>>[number];
type Candidate = Awaited<ReturnType<typeof getInstructorCandidates>>[number];
type CourseFormState = {
  title: string;
  description: string;
  category: string;
  level: string;
  instructor_id: string;
};

const emptyCourseForm = (): CourseFormState => ({
  title: '',
  description: '',
  category: categories[0]?.name ?? 'Digital Skills Academy',
  level: 'Beginner',
  instructor_id: 'unassigned',
});

function courseForm(course?: AdminCourse | AssignedCourse): CourseFormState {
  return {
    title: course?.title ?? '',
    description: course?.description ?? '',
    category: course?.category ?? categories[0]?.name ?? 'Digital Skills Academy',
    level: course?.level ?? 'Beginner',
    instructor_id: 'instructor' in (course ?? {}) ? course?.instructor_id ?? 'unassigned' : 'unassigned',
  };
}

export function AdminCourseManagement() {
  const queryClient = useQueryClient();
  const { data: courses } = useSuspenseQuery({ queryKey: ['admin-courses'], queryFn: () => getAdminCourses() });
  const { data: instructors } = useSuspenseQuery({ queryKey: ['instructor-directory'], queryFn: () => getInstructorDirectory() });
  const saveNew = useServerFn(createCourse);
  const saveExisting = useServerFn(updateAdminCourse);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCourse | null>(null);
  const [form, setForm] = useState<CourseFormState>(emptyCourseForm);
  const [saving, setSaving] = useState(false);
  const visibleCourses = courses.filter((course) =>
    `${course.title} ${course.category} ${course.instructor?.full_name ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyCourseForm());
    setDialogOpen(true);
  }

  function openEdit(course: AdminCourse) {
    setEditing(course);
    setForm(courseForm(course));
    setDialogOpen(true);
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['published-courses'] }),
    ]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const values = { ...form, instructor_id: form.instructor_id === 'unassigned' ? null : form.instructor_id };
    try {
      if (editing) {
        await saveExisting({ data: { id: editing.id, ...values, status: editing.status === 'published' ? 'published' : 'draft' } });
        toast.success('Course saved.');
      } else {
        await saveNew({ data: values });
        toast.success('Course created as a draft.');
      }
      setDialogOpen(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save this course.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublication(course: AdminCourse) {
    try {
      await saveExisting({
        data: {
          id: course.id,
          title: course.title,
          description: course.description,
          category: course.category,
          level: course.level,
          instructor_id: course.instructor_id,
          status: course.status === 'published' ? 'draft' : 'published',
        },
      });
      toast.success(course.status === 'published' ? 'Course moved to drafts.' : 'Course published.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update course status.');
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow text-primary mb-3">Academy catalogue</p>
          <h1 className="section-title">Courses</h1>
          <p className="text-sm text-muted-foreground mt-3">Create courses and assign an instructor.</p>
        </div>
        <Button onClick={openCreate}><UserPlus size={17} /> New course</Button>
      </div>

      <div className="relative max-w-md mt-8">
        <Search size={18} className="absolute left-3 top-3.5 text-muted-foreground" />
        <Input className="pl-10" aria-label="Search courses" placeholder="Search courses or instructors" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <div className="mt-7 overflow-x-auto border-y border-border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              {['Course', 'Instructor', 'Level', 'Status', ''].map((heading) => <th className="px-3 py-4 font-medium" key={heading || 'actions'}>{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleCourses.map((course) => (
              <tr className="border-t border-border" key={course.id}>
                <td className="px-3 py-4">
                  <p className="font-semibold">{course.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{course.category}</p>
                </td>
                <td className="px-3 py-4">{course.instructor?.full_name || 'Unassigned'}</td>
                <td className="px-3 py-4">{course.level}</td>
                <td className="px-3 py-4"><CourseStatus status={course.status} /></td>
                <td className="px-3 py-4">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(course)}>Edit</Button>
                    <Button size="sm" variant={course.status === 'published' ? 'secondary' : 'default'} onClick={() => void togglePublication(course)}>
                      {course.status === 'published' ? 'Unpublish' : 'Publish'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleCourses.length === 0 && (
          <div className="py-16 text-center">
            <BookOpen className="mx-auto text-primary" size={28} />
            <h2 className="font-semibold mt-4">{courses.length === 0 ? 'No courses yet' : 'No matching courses'}</h2>
            <p className="text-sm text-muted-foreground mt-2">{courses.length === 0 ? 'Create your first course to start building the catalogue.' : 'Try another course or instructor name.'}</p>
            {courses.length === 0 && <Button className="mt-5" onClick={openCreate}>Create course</Button>}
          </div>
        )}
      </div>

      <CourseEditorDialog
        title={editing ? 'Edit course' : 'Create a course'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        instructors={instructors}
        saving={saving}
        onSubmit={submit}
      />
    </section>
  );
}

export function InstructorManagement() {
  const queryClient = useQueryClient();
  const { data: instructors } = useSuspenseQuery({ queryKey: ['instructor-directory'], queryFn: () => getInstructorDirectory() });
  const { data: candidates } = useSuspenseQuery({ queryKey: ['instructor-candidates'], queryFn: () => getInstructorCandidates() });
  const grantAccess = useServerFn(approveInstructor);
  const [query, setQuery] = useState('');
  const [granting, setGranting] = useState<string | null>(null);
  const current = instructors.filter((person) => `${person.full_name} ${person.email}`.toLowerCase().includes(query.toLowerCase()));
  const available = candidates.filter((person) => `${person.full_name} ${person.email}`.toLowerCase().includes(query.toLowerCase()));

  async function grant(userId: string) {
    setGranting(userId);
    try {
      await grantAccess({ data: { target_id: userId } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instructor-directory'] }),
        queryClient.invalidateQueries({ queryKey: ['instructor-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
      ]);
      toast.success('Instructor access granted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to grant instructor access.');
    } finally {
      setGranting(null);
    }
  }

  return (
    <section>
      <p className="eyebrow text-primary mb-3">People and access</p>
      <h1 className="section-title">Instructors</h1>
      <p className="text-sm text-muted-foreground mt-3">Assign verified accounts to teach and manage courses.</p>
      <div className="relative max-w-md mt-7">
        <Search size={18} className="absolute left-3 top-3.5 text-muted-foreground" />
        <Input className="pl-10" aria-label="Search instructors" placeholder="Search by name or email" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      <h2 className="font-semibold mt-9 mb-3">Current instructors <span className="text-muted-foreground">({instructors.length})</span></h2>
      <div className="overflow-x-auto border-y border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr>{['Full name', 'Email', 'Registered'].map((heading) => <th className="px-3 py-4 font-medium" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>
            {current.map((person) => <tr className="border-t border-border" key={person.id}>
              <td className="px-3 py-4 font-medium">{person.full_name || 'Not provided'}</td>
              <td className="px-3 py-4">{person.email}</td>
              <td className="px-3 py-4">{new Date(person.created_at).toLocaleDateString()}</td>
            </tr>)}
          </tbody>
        </table>
        {current.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No instructors match this search.</p>}
      </div>

      <h2 className="font-semibold mt-10 mb-3">Verified accounts available for instructor access <span className="text-muted-foreground">({available.length})</span></h2>
      <div className="overflow-x-auto border-y border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr>{['Full name', 'Email', 'Registered', ''].map((heading, index) => <th className="px-3 py-4 font-medium" key={heading || index}>{heading}</th>)}</tr></thead>
          <tbody>
            {available.map((person: Candidate) => <tr className="border-t border-border" key={person.user_id}>
              <td className="px-3 py-4 font-medium">{person.full_name || 'Not provided'}</td>
              <td className="px-3 py-4">{person.email}</td>
              <td className="px-3 py-4">{new Date(person.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-4 text-right"><Button size="sm" variant="outline" disabled={granting === person.user_id} onClick={() => void grant(person.user_id)}>{granting === person.user_id ? 'Adding…' : 'Grant access'}</Button></td>
            </tr>)}
          </tbody>
        </table>
        {available.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No verified accounts are available to add.</p>}
      </div>
    </section>
  );
}

export function InstructorOverview() {
  const { data: courses } = useSuspenseQuery({ queryKey: ['assigned-courses'], queryFn: () => getAssignedCourses() });
  const published = courses.filter((course) => course.status === 'published').length;
  return (
    <section>
      <p className="eyebrow text-primary mb-3">Instructor workspace</p>
      <h1 className="section-title">Welcome to your teaching space</h1>
      <p className="text-sm text-muted-foreground mt-3">Review and prepare the courses assigned to you.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5 my-8">
        <div className="stat"><div className="flex justify-between"><p className="text-sm text-muted-foreground">Assigned courses</p><BookOpen size={20} className="text-primary" /></div><p className="text-3xl font-display font-semibold mt-5">{courses.length}</p></div>
        <div className="stat"><div className="flex justify-between"><p className="text-sm text-muted-foreground">Published</p><CheckCircle2 size={20} className="text-primary" /></div><p className="text-3xl font-display font-semibold mt-5">{published}</p></div>
        <div className="stat"><div className="flex justify-between"><p className="text-sm text-muted-foreground">In draft</p><Clock3 size={20} className="text-primary" /></div><p className="text-3xl font-display font-semibold mt-5">{courses.length - published}</p></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-6">
        <div><h2 className="font-semibold">Your assigned courses</h2><p className="text-sm text-muted-foreground mt-1">Course assignment and publishing are managed by the academy administrator.</p></div>
        <Button asChild><Link to="/instructor/courses">Open courses <ArrowRight size={16} /></Link></Button>
      </div>
    </section>
  );
}

export function InstructorCourseManagement() {
  const queryClient = useQueryClient();
  const { data: courses } = useSuspenseQuery({ queryKey: ['assigned-courses'], queryFn: () => getAssignedCourses() });
  const save = useServerFn(updateAssignedCourse);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssignedCourse | null>(null);
  const [form, setForm] = useState<CourseFormState>(emptyCourseForm);
  const [saving, setSaving] = useState(false);
  const visibleCourses = courses.filter((course) => `${course.title} ${course.category}`.toLowerCase().includes(query.toLowerCase()));

  function openEdit(course: AssignedCourse) {
    setEditing(course);
    setForm(courseForm(course));
    setDialogOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await save({ data: { id: editing.id, title: form.title, description: form.description, category: form.category, level: form.level } });
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['assigned-courses'] });
      toast.success('Course details saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save course details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <p className="eyebrow text-primary mb-3">Teaching</p>
      <h1 className="section-title">My assigned courses</h1>
      <p className="text-sm text-muted-foreground mt-3">Edit course details for courses assigned to your account.</p>
      <div className="relative max-w-md mt-7">
        <Search size={18} className="absolute left-3 top-3.5 text-muted-foreground" />
        <Input className="pl-10" aria-label="Search assigned courses" placeholder="Search your courses" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="mt-7 overflow-x-auto border-y border-border">
        <table className="w-full min-w-[660px] text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr>{['Course', 'Category', 'Level', 'Status', ''].map((heading, index) => <th className="px-3 py-4 font-medium" key={heading || index}>{heading}</th>)}</tr></thead>
          <tbody>{visibleCourses.map((course) => <tr className="border-t border-border" key={course.id}>
            <td className="px-3 py-4 font-semibold">{course.title}</td>
            <td className="px-3 py-4">{course.category}</td>
            <td className="px-3 py-4">{course.level}</td>
            <td className="px-3 py-4"><CourseStatus status={course.status} /></td>
            <td className="px-3 py-4 text-right"><Button variant="outline" size="sm" onClick={() => openEdit(course)}>Edit details</Button></td>
          </tr>)}</tbody>
        </table>
        {visibleCourses.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{courses.length === 0 ? 'No courses have been assigned to you yet.' : 'No matching courses.'}</p>}
      </div>

      <CourseEditorDialog title="Edit course details" open={dialogOpen} onOpenChange={setDialogOpen} form={form} setForm={setForm} saving={saving} onSubmit={submit} />
    </section>
  );
}

function CourseEditorDialog({
  title,
  open,
  onOpenChange,
  form,
  setForm,
  instructors,
  saving,
  onSubmit,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CourseFormState;
  setForm: Dispatch<SetStateAction<CourseFormState>>;
  instructors?: Instructor[];
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Course details and the assigned instructor.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={onSubmit}>
          <label className="block text-sm font-semibold">Course title
            <Input className="mt-2" minLength={3} maxLength={160} required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label className="block text-sm font-semibold">Description
            <Textarea className="mt-2 min-h-28" maxLength={5000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm font-semibold">Category
              <Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category }))}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((category) => <SelectItem value={category.name} key={category.name}>{category.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="block text-sm font-semibold">Level
              <Select value={form.level} onValueChange={(level) => setForm((current) => ({ ...current, level }))}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>{['Beginner', 'Intermediate', 'Advanced'].map((level) => <SelectItem value={level} key={level}>{level}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          </div>
          {instructors && <label className="block text-sm font-semibold">Instructor
            <Select value={form.instructor_id} onValueChange={(instructor_id) => setForm((current) => ({ ...current, instructor_id }))}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">No instructor assigned</SelectItem>
                {instructors.map((instructor) => <SelectItem value={instructor.id} key={instructor.id}>{instructor.full_name || instructor.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save course'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CourseStatus({ status }: { status: string }) {
  return <Badge variant={status === 'published' ? 'default' : 'outline'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>;
}