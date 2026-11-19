import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
export const getAccount = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const [p,r]=await Promise.all([context.supabase.from('profiles').select('*').eq('id',context.userId).single(),context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'})]);
 if(p.error) throw new Error('Unable to load your profile. Please try again.'); if(r.error) throw new Error('Unable to verify account access.');
 return {profile:p.data,isAdmin:r.data===true};
});
export const updateProfile = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({full_name:z.string().trim().min(2).max(120)})).handler(async({data,context})=>{
 const result=await context.supabase.from('profiles').update({full_name:data.full_name}).eq('id',context.userId).select().single(); if(result.error) throw new Error('Your profile could not be saved.');return result.data;
});
export const getAdminOverview = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const role=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(role.error || !role.data) throw new Error('Administrator access required.');
 const [profiles,roles]=await Promise.all([context.supabase.from('profiles').select('*').order('created_at',{ascending:false}).limit(1000),context.supabase.from('user_roles').select('user_id,role').limit(1000)]);
 if(profiles.error||roles.error) throw new Error('Unable to load academy accounts.');
 const [learners,admins]=await Promise.all([context.supabase.from('user_roles').select('id',{count:'exact',head:true}).eq('role','learner'),context.supabase.from('user_roles').select('id',{count:'exact',head:true}).eq('role','admin')]);
 if(learners.error||admins.error) throw new Error('Unable to load account totals.');
 return {profiles:profiles.data,roles:roles.data,learners:learners.count??0,administrators:admins.count??0};
});
export const approveAdmin = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({target_id:z.string().uuid()})).handler(async({context,data})=>{
 const role=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(role.error||!role.data)throw new Error('Administrator access required.');
 const result=await context.supabase.rpc('approve_administrator',{target_id:data.target_id});if(result.error)throw new Error(result.error.message);return {success:true};
});
