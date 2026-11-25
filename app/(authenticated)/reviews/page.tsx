'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Calendar, ClipboardCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { SafeDate } from '@/components/safe-format';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReviewsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const router = useRouter();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', reviewDate: '', description: '', copyFromReviewId: '' });
  const [creating, setCreating] = useState(false);

  const fetchReviews = async () => {
    try {
      const res = await fetch('/api/reviews');
      if (res.ok) setReviews(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchReviews(); }, []);

  const handleCreate = async () => {
    if (!form.name || !form.reviewDate) { toast.error('Name and date required'); return; }
    setCreating(true);
    try {
      const body: any = { name: form.name, reviewDate: form.reviewDate, description: form.description };
      if (form.copyFromReviewId && form.copyFromReviewId !== 'none') {
        body.copyFromReviewId = form.copyFromReviewId;
      }
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Review created');
        setDialogOpen(false);
        setForm({ name: '', reviewDate: '', description: '', copyFromReviewId: '' });
        fetchReviews();
      } else {
        const data = await res.json();
        toast.error(data?.error ?? 'Failed');
      }
    } catch { toast.error('Failed'); } finally { setCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this review and all its assessments?')) return;
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Deleted'); fetchReviews(); }
      else toast.error('Failed to delete');
    } catch { toast.error('Failed'); }
  };

  const canEdit = user?.role === 'ADMIN' || user?.role === 'ASSESSOR';

  return (
    <div>
      <PageHeader
        title="Reviews"
        description="Assessment reviews track the state of all 50 controls at a point in time."
        actions={
          canEdit ? (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> New Review</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Review</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Review Name</Label>
                    <Input placeholder="Q4 2026 Review" value={form.name} onChange={(e: any) => setForm({ ...form, name: e?.target?.value ?? '' })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Review Date</Label>
                    <Input type="date" value={form.reviewDate} onChange={(e: any) => setForm({ ...form, reviewDate: e?.target?.value ?? '' })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea placeholder="Notes about this review..." value={form.description} onChange={(e: any) => setForm({ ...form, description: e?.target?.value ?? '' })} />
                  </div>
                  {reviews.length > 0 && (
                    <div className="space-y-2">
                      <Label>Copy from previous review (optional)</Label>
                      <Select value={form.copyFromReviewId} onValueChange={(v: string) => setForm({ ...form, copyFromReviewId: v })}>
                        <SelectTrigger><SelectValue placeholder="Start blank" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Start blank</SelectItem>
                          {reviews.map((r: any) => (
                            <SelectItem key={r?.id} value={r?.id ?? ''}>{r?.name ?? 'Untitled'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button onClick={handleCreate} loading={creating} className="w-full">Create Review</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {loading ? (
        <div className="grid gap-4 mt-6">
          {[1,2,3].map((i: number) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No reviews yet. Create your first review to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 mt-6">
          {reviews.map((review: any) => (
            <Card key={review?.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push(`/reviews/${review?.id}`)}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{review?.name ?? 'Untitled'}</CardTitle>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <SafeDate date={review?.reviewDate} options={{ dateStyle: 'long' }} />
                    <span>· by {review?.createdBy?.name ?? review?.createdBy?.email ?? 'Unknown'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e: any) => e?.stopPropagation?.()}>
                  <Badge variant="secondary">{review?._count?.assessments ?? 0} assessments</Badge>
                  <Badge variant="outline">{review?._count?.actions ?? 0} actions</Badge>
                  {user?.role === 'ADMIN' && (
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(review?.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              {review?.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{review.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
