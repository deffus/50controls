'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ListTodo, Calendar, Download, AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { SafeDate } from '@/components/safe-format';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-amber-500/20 text-amber-500',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-500',
  CLOSED: 'bg-green-500/20 text-green-500',
  CANCELLED: 'bg-gray-500/20 text-gray-500',
};

export default function ActionsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ASSESSOR';
  const searchParams = useSearchParams();
  const initialFilter = searchParams?.get('filter') ?? 'all';

  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editAction, setEditAction] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  const fetchActions = async () => {
    try {
      let url = '/api/actions';
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (params.toString()) url += '?' + params.toString();
      const res = await fetch(url);
      if (res.ok) setActions(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchActions(); }, [filter, statusFilter]);
  useEffect(() => {
    fetch('/api/users').then((r: any) => r?.ok ? r.json() : []).then(setUsers).catch(() => {});
  }, []);

  const handleEditOpen = (action: any) => {
    setEditAction(action);
    setEditForm({
      description: action?.description ?? '',
      status: action?.status ?? 'OPEN',
      notes: action?.notes ?? '',
      ownerId: action?.owner?.id ?? '',
      dueDate: action?.dueDate ? new Date(action.dueDate).toISOString().slice(0, 10) : '',
      closedDate: action?.closedDate ? new Date(action.closedDate).toISOString().slice(0, 10) : '',
    });
  };

  const handleSave = async () => {
    if (!editAction?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/actions/${editAction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success('Action updated');
        setEditAction(null);
        fetchActions();
      } else toast.error('Failed');
    } catch { toast.error('Failed'); } finally { setSaving(false); }
  };

  const isOverdue = (action: any) => {
    if (!action?.dueDate) return false;
    return new Date(action.dueDate) < new Date() && ['OPEN', 'IN_PROGRESS'].includes(action?.status);
  };

  return (
    <div>
      <PageHeader
        title="Action Tracker"
        description="Remediation actions linked to control assessments."
        actions={
          <Button variant="outline" size="sm" onClick={() => window.open('/api/ics', '_blank')}>
            <Calendar className="h-4 w-4 mr-2" /> Export .ics
          </Button>
        }
      />

      <div className="flex gap-3 mt-6 mb-4">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="due-soon">Due soon (7d)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i: number) => <Skeleton key={i} className="h-16" />)}</div>
      ) : actions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ListTodo className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No actions found.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[120px]">Owner</TableHead>
                  <TableHead className="w-[110px]">Due Date</TableHead>
                  <TableHead className="w-[110px]">Closed</TableHead>
                  <TableHead className="w-[120px]">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((action: any) => (
                  <TableRow
                    key={action?.id}
                    className={`${canEdit ? 'cursor-pointer hover:bg-accent/50' : ''} ${isOverdue(action) ? 'bg-destructive/5' : ''}`}
                    onClick={canEdit ? () => handleEditOpen(action) : undefined}
                  >
                    <TableCell>
                      <div className="flex items-start gap-2">
                        {isOverdue(action) && <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />}
                        <span className="text-sm">{action?.description ?? ''}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[action?.status] ?? ''}>{action?.status?.replace('_', ' ') ?? ''}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{action?.owner?.name ?? '–'}</TableCell>
                    <TableCell className="text-sm">
                      {action?.dueDate ? <SafeDate date={action.dueDate} options={{ dateStyle: 'medium' }} /> : '–'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {action?.closedDate ? <SafeDate date={action.closedDate} options={{ dateStyle: 'medium' }} /> : '–'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{action?.review?.name ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* Edit Action Dialog */}
      <Dialog open={!!editAction} onOpenChange={(open: boolean) => { if (!open) setEditAction(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Action</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editForm.description ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), description: e?.target?.value ?? '' })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status ?? 'OPEN'} onValueChange={(v: string) => setEditForm({ ...(editForm ?? {}), status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={editForm.ownerId ?? ''} onValueChange={(v: string) => setEditForm({ ...(editForm ?? {}), ownerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u: any) => <SelectItem key={u?.id} value={u?.id ?? ''}>{u?.name ?? u?.email ?? 'User'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={editForm.dueDate ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), dueDate: e?.target?.value ?? '' })} />
              </div>
              <div className="space-y-2">
                <Label>Closed Date</Label>
                <Input type="date" value={editForm.closedDate ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), closedDate: e?.target?.value ?? '' })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editForm.notes ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), notes: e?.target?.value ?? '' })} rows={3} />
            </div>
            <Button onClick={handleSave} loading={saving} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
