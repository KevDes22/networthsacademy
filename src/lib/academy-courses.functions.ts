import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Database } from '@/integrations/supabase/types';
import { canEditAssignedCourse, hasCourseAdministrationAccess } from '@/lib/academy';

const courseDetailsSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000),
  category: z.string().trim().min(2).max(100),
  level: z.string().trim().min(2).max(50),
});

const adminCourseSchema = courseDetailsSchema.extend({
  instructor_id: z.string().uuid().nullable(),
});

const requireAdmin = async (context: {
  supabase: { rpc: (name: 'has_role', args: { _user_id: string; _role: 'admin' }) => Promise<{ data: boolean | null; error: unknown }> };
  userId: string;
}) => {
  const result = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (result.error || !hasCourseAdministrationAccess(result.data === true)) {
    throw new Error('Administrator access required.');
  }
};

export const getPublishedCourses = createServerFn({ method: 'GET' }).handler(async () => {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Published courses are unavailable right now.');

  const client = createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
        if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) {
          headers.delete('Authorization');
        }
        headers.set('apikey', key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client
    .from('courses')
    .select('id, title, description, category, level, status, published_at, created_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false });
  if (error) throw new Error('Published courses are unavailable right now.');
  return data;
});

export const getAdminCourses = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from('courses').select('*').order('created_at', { ascending: false });
    if (error) throw new Error('Unable to load academy courses.');

    const instructorIds = [...new Set(data.map((course) => course.instructor_id).filter((id): id is string => Boolean(id)))];
    if (instructorIds.length === 0) return data.map((course) => ({ ...course, instructor: null }));

    const profiles = await context.supabase.from('profiles').select('id, full_name, email').in('id', instructorIds);
    if (profiles.error) throw new Error('Unable to load course instructor details.');
    const profileById = new Map(profiles.data.map((profile) => [profile.id, profile]));
    return data.map((course) => ({
      ...course,
      instructor: course.instructor_id ? profileById.get(course.instructor_id) ?? null : null,
    }));
  });

export const getInstructorDirectory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const roles = await context.supabase.from('user_roles').select('user_id').eq('role', 'instructor').limit(1000);
    if (roles.error) throw new Error('Unable to load instructors.');
    const ids = [...new Set(roles.data.map((role) => role.user_id))];
    if (ids.length === 0) return [];
    const profiles = await context.supabase.from('profiles').select('id, full_name, email, created_at').in('id', ids);
    if (profiles.error) throw new Error('Unable to load instructor profiles.');
    return profiles.data;
  });

export const getInstructorCandidates = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.rpc('get_verified_instructor_candidates');
    if (error) throw new Error('Unable to load verified instructor candidates.');
    return data;
  });

export const createCourse = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(adminCourseSchema)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { data: course, error } = await context.supabase
      .from('courses')
      .insert({ ...data, status: 'draft', created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error('Unable to create this course. Check that the selected instructor is active.');
    return course;
  });

export const updateAdminCourse = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(adminCourseSchema.extend({ id: z.string().uuid(), status: z.enum(['draft', 'published']) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { id, ...changes } = data;
    const { data: course, error } = await context.supabase.from('courses').update(changes).eq('id', id).select().single();
    if (error) throw new Error('Unable to save this course. Check the instructor and course details.');
    return course;
  });

export const getAssignedCourses = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'instructor' });
    if (role.error || role.data !== true) throw new Error('Instructor access required.');
    const { data, error } = await context.supabase
      .from('courses')
      .select('*')
      .eq('instructor_id', context.userId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error('Unable to load your assigned courses.');
    return data;
  });

export const updateAssignedCourse = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(courseDetailsSchema.extend({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'instructor' });
    if (role.error || role.data !== true) throw new Error('Instructor access required.');

    const current = await context.supabase.from('courses').select('instructor_id').eq('id', data.id).maybeSingle();
    if (current.error || !current.data || !canEditAssignedCourse(false, true, context.userId, current.data.instructor_id)) {
      throw new Error('You can only edit courses assigned to your instructor account.');
    }

    const { id, ...changes } = data;
    const { data: course, error } = await context.supabase
      .from('courses')
      .update(changes)
      .eq('id', id)
      .eq('instructor_id', context.userId)
      .select()
      .single();
    if (error) throw new Error('Unable to save this course.');
    return course;
  });