import { SignupForm } from './_components/signup-form';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return (
    <AuthLayout title="Create Account" description="Sign up for Cyber Assurance">
      <SignupForm />
    </AuthLayout>
  );
}
