'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Mail, Lock } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) {
        toast.error('Invalid email or password');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex justify-center mb-4">
        <Shield className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e: any) => setEmail(e?.target?.value ?? '')} className="pl-10" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e: any) => setPassword(e?.target?.value ?? '')} className="pl-10" required />
        </div>
      </div>
      <Button type="submit" className="w-full" loading={loading}>Sign In</Button>
      <p className="text-center text-sm text-muted-foreground">
        No account yet?{' '}
        <Link href="/signup" className="text-primary hover:underline">Create one</Link>
      </p>
    </form>
  );
}
