import { Sparkles, Database, MessageSquareText, ScanEye, Laptop, Compass } from 'lucide-react';
export const categories = [
 {name:'AI Content Creation',icon:Sparkles,description:'Turn ideas into impactful content',short:'AI Content'},
 {name:'Data Annotation',icon:Database,description:'Build the data behind smarter AI',short:'Data Annotation'},
 {name:'Prompt Engineering and Evaluation',icon:MessageSquareText,description:'Get more from generative AI',short:'Prompt Engineering'},
 {name:'Human–AI Review',icon:ScanEye,description:'Bring human judgement to AI',short:'Human–AI Review'},
 {name:'Digital Skills Academy',icon:Laptop,description:'Your foundation for the digital world',short:'Digital Skills'},
 {name:'Career Development and Mentorship',icon:Compass,description:'Find direction. Take your next step.',short:'Career Development'},
];
export const sampleCourses = [
 {title:'AI Content Creation: From Ideas to Impact',category:0,level:'Beginner',hours:'6 hours',lessons:18,art:'art-ai',icon:Sparkles,cover:'CREATE WITH AI',tag:'Popular preview'},
 {title:'Data Annotation Fundamentals',category:1,level:'Beginner',hours:'5 hours',lessons:16,art:'art-data',icon:Database,cover:'DATA THAT MATTERS',tag:'Sample course'},
 {title:'The Art of Prompt Engineering',category:2,level:'Beginner',hours:'7 hours',lessons:22,art:'art-prompt',icon:MessageSquareText,cover:'THINK. PROMPT. REFINE.',tag:'Sample course'},
 {title:'Remote Work & Digital Career Essentials',category:4,level:'Beginner',hours:'4 hours',lessons:12,art:'art-career',icon:Laptop,cover:'YOUR NEXT CHAPTER',tag:'Sample course'},
];
export function pageHead(title:string, description:string) {return {meta:[{title:`${title} | Networths Academy`},{name:'description',content:description},{property:'og:title',content:`${title} | Networths Academy`},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]};}
export function dashboardDestination(isAdmin: boolean, isInstructor = false) {
 if (isAdmin) return '/admin/dashboard' as const;
 if (isInstructor) return '/instructor/dashboard' as const;
 return '/dashboard' as const;
}
export function hasCourseAdministrationAccess(isAdmin: boolean) { return isAdmin; }
export function canEditAssignedCourse(isAdmin: boolean, isInstructor: boolean, userId: string, instructorId: string | null) {
 return isAdmin || (isInstructor && instructorId !== null && instructorId === userId);
}
export function validateRegistration(name:string,password:string,confirm:string,terms:boolean) {
 if(name.trim().length<2) return 'Please enter your full name.';
 if(password.length<8) return 'Use a password with at least 8 characters.';
 if(password!==confirm) return 'Your passwords do not match.';
 if(!terms) return 'Please agree to the Terms and Privacy Policy.';
 return null;
}
