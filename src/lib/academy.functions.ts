import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
export const getAccount = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [profile, adminRole, instructorRole] = await Promise.all([
    context.supabase.from('profiles').select('*').eq('id', context.userId).single(),
    context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' }),
    context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'instructor' }),
  ]);
  if (profile.error) throw new Error('Unable to load your profile. Please try again.');
  if (adminRole.error || instructorRole.error) throw new Error('Unable to verify account access.');
  return { profile: profile.data, isAdmin: adminRole.data === true, isInstructor: instructorRole.data === true };
});

export const updateProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ full_name: z.string().trim().min(2).max(120) }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from('profiles').update({ full_name: data.full_name }).eq('id', context.userId).select().single();
    if (result.error) throw new Error('Your profile could not be saved.');
    return result.data;
  });

export const getAdminOverview = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (role.error || !role.data) throw new Error('Administrator access required.');
  const [profiles, roles, courses, publishedCourses] = await Promise.all([
    context.supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000),
    context.supabase.from('user_roles').select('user_id,role').limit(1000),
    context.supabase.from('courses').select('id', { count: 'exact', head: true }),
    context.supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'published'),
  ]);
  if (profiles.error || roles.error || courses.error || publishedCourses.error) throw new Error('Unable to load academy overview.');
  const administrators = new Set(roles.data.filter((entry) => entry.role === 'admin').map((entry) => entry.user_id));
  const instructors = new Set(roles.data.filter((entry) => entry.role === 'instructor').map((entry) => entry.user_id));
  const learners = new Set(roles.data.filter((entry) => entry.role === 'learner' && !administrators.has(entry.user_id) && !instructors.has(entry.user_id)).map((entry) => entry.user_id));
  return {
    profiles: profiles.data,
    roles: roles.data,
    learners: learners.size,
    administrators: administrators.size,
    instructors: instructors.size,
    courses: courses.count ?? 0,
    publishedCourses: publishedCourses.count ?? 0,
  };
});

export const approveAdmin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ target_id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error || !role.data) throw new Error('Administrator access required.');
    const result = await context.supabase.rpc('approve_administrator', { target_id: data.target_id });
    if (result.error) throw new Error('Administrator access could not be granted. Check that the account is verified.');
    return { success: true };
  });

export const approveInstructor = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ target_id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error || !role.data) throw new Error('Administrator access required.');
    const result = await context.supabase.rpc('approve_instructor', { target_id: data.target_id });
    if (result.error) throw new Error('Instructor access could not be granted. Confirm that the account is verified.');
    return { success: true };
  });
