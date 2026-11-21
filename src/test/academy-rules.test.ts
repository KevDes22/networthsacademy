import {describe,it,expect} from 'vitest';
import {canEditAssignedCourse,dashboardDestination,hasCourseAdministrationAccess,validateRegistration} from '@/lib/academy';
describe('Academy account rules',()=>{
 it('sends learners to /dashboard',()=>expect(dashboardDestination(false)).toBe('/dashboard'));
 it('sends verified administrators to /admin/dashboard',()=>expect(dashboardDestination(true)).toBe('/admin/dashboard'));
 it('sends instructors to their instructor workspace',()=>expect(dashboardDestination(false,true)).toBe('/instructor/dashboard'));
 it('lets instructors edit only courses assigned to their own account',()=>{
  expect(canEditAssignedCourse(false,true,'instructor-a','instructor-a')).toBe(true);
  expect(canEditAssignedCourse(false,true,'instructor-a','instructor-b')).toBe(false);
 });
 it('allows only administrators to assign or publish courses',()=>{
  expect(hasCourseAdministrationAccess(true)).toBe(true);
  expect(hasCourseAdministrationAccess(false)).toBe(false);
 });
 it('rejects mismatched confirmation passwords',()=>expect(validateRegistration('Ada Okafor','password123','different123',true)).not.toBeNull());
 it('requires the Terms and Privacy agreement',()=>expect(validateRegistration('Ada Okafor','password123','password123',false)).not.toBeNull());
 it('accepts valid learner registration',()=>expect(validateRegistration('Ada Okafor','password123','password123',true)).toBeNull());
});