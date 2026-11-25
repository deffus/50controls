import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { UserManagement } from './user-management';

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');
  return <UserManagement currentUserId={session.user.id} />;
}
