import { LoginForm } from './_components/login-form';
import { AuthLayout } from '@/components/layouts/auth-layout';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return (
    <AuthLayout title="Cyber Assurance" description="Sign in to continue">
      <LoginForm />
    </AuthLayout>
  );
}
