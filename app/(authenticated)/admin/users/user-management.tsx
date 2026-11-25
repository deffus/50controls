'use client';

import { useEffect, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { PageHeader } from '@/components/layouts/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SafeDate } from '@/components/safe-format';
import { toast } from 'sonner';
import { resetUserPassword } from './password-actions';
import { createUserSchema, userProfileSchema, passwordSchema } from '@/lib/user-validation';

type User = { id: string; name: string | null; email: string; role: 'ADMIN' | 'ASSESSOR' | 'VIEWER'; createdAt: string };
type Mode = 'create' | 'edit' | 'reset';
const emptyForm = { name: '', email: '', role: 'VIEWER' as User['role'], password: '', confirm: '' };

export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const { update } = useSession() || {};
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    setLoading(true); setLoadError('');
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load users. Check your sign-in and try again.');
      setUsers(await res.json());
    } catch (err) { console.error(err); setLoadError(err instanceof Error ? err.message : 'Unable to load users.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadUsers(); }, []);

  function open(next: Mode, user: User | null = null) {
    setSelected(user); setForm({ ...emptyForm, ...(user ? { name: user.name || '', email: user.email, role: user.role } : {}) });
    setError(''); setMode(next);
  }
  function close() { if (!saving) { setMode(null); setForm(emptyForm); setError(''); } }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const profile = { name: form.name, email: form.email, role: form.role };
    const parsed = mode === 'reset' ? passwordSchema.safeParse(form.password) : mode === 'create'
      ? createUserSchema.safeParse({ ...profile, password: form.password }) : userProfileSchema.safeParse(profile);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (mode !== 'edit' && form.password !== form.confirm) { setError('The passwords do not match.'); return; }
    setSaving(true);
    try {
      if (mode === 'reset' && selected) {
        const result = await resetUserPassword(selected.id, form.password);
        if (result.error) throw new Error(result.error);
        setForm(emptyForm); setMode(null);
        toast.success('Password reset. Existing sessions are now invalid.');
        if (result.signOut) await signOut({ redirectTo: '/login' });
      } else {
        const res = await fetch(mode === 'create' ? '/api/users' : `/api/users/${selected?.id}`, {
          method: mode === 'create' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to save the user.');
        setUsers(prev => mode === 'create' ? [...prev, data] : prev.map(u => u.id === data.id ? data : u));
        setForm(emptyForm); setMode(null);
        toast.success(mode === 'create' ? 'User created. Share their credentials securely.' : 'User saved. Access changes apply on the next request.');
        if (data.id === currentUserId) await update?.();
      }
    } catch (err) { console.error(err); setError(err instanceof Error ? err.message : 'Unable to save.'); }
    finally { setSaving(false); }
  }

  return <div>
    <PageHeader title="User Management" description="Create accounts, edit access and reset passwords." />
    <div className="mt-6 flex justify-end"><Button onClick={() => open('create')}>Create user</Button></div>
    {loadError ? <Card className="mt-4 p-6"><p role="alert">{loadError}</p><Button variant="outline" className="mt-3" onClick={loadUsers}>Retry</Button></Card>
      : loading ? <p className="mt-6" role="status">Loading users…</p>
      : <Card className="mt-4 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Access</TableHead><TableHead>Joined</TableHead><TableHead>Manage</TableHead></TableRow></TableHeader>
        <TableBody>{users.map(user => <TableRow key={user.id}>
          <TableCell className="font-medium">{user.name || 'Unnamed'}{user.id === currentUserId && <span className="ml-2 text-muted-foreground">(you)</span>}</TableCell>
          <TableCell><span suppressHydrationWarning>{user.email}</span></TableCell>
          <TableCell>{user.role === 'ADMIN' ? 'Admin' : user.role === 'ASSESSOR' ? 'Assessor' : 'Viewer'}</TableCell>
          <TableCell><SafeDate date={user.createdAt} options={{ dateStyle: 'medium' }} /></TableCell>
          <TableCell><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => open('edit', user)} aria-label={`Edit ${user.name || user.email}`}>Edit</Button><Button size="sm" variant="outline" onClick={() => open('reset', user)} aria-label={`Reset password for ${user.name || user.email}`}>Reset password</Button></div></TableCell>
        </TableRow>)}</TableBody>
      </Table></Card>}
    <Card className="mt-6 p-6 space-y-3">
      <h2 className="font-semibold">Access and password help</h2>
      <p className="text-sm text-muted-foreground"><strong>Admin:</strong> manages users and assurance work. <strong>Assessor:</strong> creates and edits reviews, checks and actions. <strong>Viewer:</strong> reads assurance information without editing it. Viewer is not a disabled account.</p>
      <p className="text-sm text-muted-foreground">To reset a password, select <strong>Reset password</strong> beside the user, enter and confirm a new password, then save. Use at least 12 characters (maximum 72 bytes). Share it using an approved secure channel, not email or chat. No reset email is sent.</p>
      <p className="text-sm text-muted-foreground">Resetting a password invalidates existing sessions on their next request. Resetting your own password signs you out. If you cannot sign in, ask another administrator to reset it; there is no self-service email recovery. Keep a second trusted administrator account for recovery. Existing sessions will require a fresh sign-in after this update.</p>
      <p className="text-sm text-muted-foreground">You cannot remove your own administrator access. Changes to other users’ roles apply on their next request; they may need to reload the page to refresh visible controls.</p>
    </Card>
    <Dialog open={mode !== null} onOpenChange={value => { if (!value) close(); }}><DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{mode === 'create' ? 'Create user' : mode === 'reset' ? 'Reset password' : 'Edit user access'}</DialogTitle><DialogDescription>{mode === 'reset' ? `Set a new password for ${selected?.name || 'this user'}. Existing sessions will be invalidated.` : 'Choose the minimum access this person needs.'}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {mode !== 'reset' && <>
          <div className="space-y-2"><Label htmlFor="user-name">Name</Label><Input id="user-name" value={form.name} maxLength={100} required disabled={saving} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="user-email">Email</Label><Input id="user-email" type="email" value={form.email} maxLength={254} required disabled={saving} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="user-role">Access level</Label><select id="user-role" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={form.role} disabled={saving || (mode === 'edit' && selected?.id === currentUserId)} onChange={e => setForm({ ...form, role: e.target.value as User['role'] })}><option value="VIEWER">Viewer</option><option value="ASSESSOR">Assessor</option><option value="ADMIN">Admin</option></select></div>
        </>}
        {mode !== 'edit' && <>
          <div className="space-y-2"><Label htmlFor="user-password">{mode === 'create' ? 'Initial password' : 'New password'}</Label><Input id="user-password" type="password" autoComplete="new-password" minLength={12} required disabled={saving} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="user-confirm">Confirm password</Label><Input id="user-confirm" type="password" autoComplete="new-password" required disabled={saving} value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></div>
          <p className="text-sm text-muted-foreground">At least 12 characters, maximum 72 bytes. No email is sent; share credentials securely.</p>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Create user' : mode === 'reset' ? 'Reset password' : 'Save changes'}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}
