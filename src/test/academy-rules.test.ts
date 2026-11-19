import {describe,it,expect} from 'vitest';
import {dashboardDestination,validateRegistration} from '@/lib/academy';
describe('Academy account rules',()=>{
 it('sends learners to /dashboard',()=>expect(dashboardDestination(false)).toBe('/dashboard'));
 it('sends verified administrators to /admin/dashboard',()=>expect(dashboardDestination(true)).toBe('/admin/dashboard'));
 it('rejects mismatched confirmation passwords',()=>expect(validateRegistration('Ada Okafor','password123','different123',true)).not.toBeNull());
 it('requires the Terms and Privacy agreement',()=>expect(validateRegistration('Ada Okafor','password123','password123',false)).not.toBeNull());
 it('accepts valid learner registration',()=>expect(validateRegistration('Ada Okafor','password123','password123',true)).toBeNull());
});