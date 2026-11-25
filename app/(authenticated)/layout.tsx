import { AuthShell } from '@/components/auth-shell';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
