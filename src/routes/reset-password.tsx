import {createFileRoute} from '@tanstack/react-router';
import {AuthPage} from '@/components/academy-auth';
import {pageHead} from '@/lib/academy';
export const Route=createFileRoute('/reset-password')({head:()=>pageHead('Reset Password','Secure account access for Networths Academy learners and administrators.'),component:()=> <AuthPage mode="reset"/>});
