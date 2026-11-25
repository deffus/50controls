'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download, FileText, Calendar, ChevronRight, Search, Filter, Plus,
  CheckCircle, XCircle, AlertTriangle, Clock, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { SafeDate } from '@/components/safe-format';
import { STATE_LABELS, STATE_COLORS, DOMAINS, calculateMaturity, calculateCoverage, calculateVerifiedEffective } from '@/lib/scoring';

const COMPLETION_OPTIONS = Object.entries(STATE_LABELS).map(([value, label]: [string, string]) => ({ value, label }));

function stateIcon(state: string) {
  switch (state) {
    case 'EFFECTIVE': return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'INEFFECTIVE': case 'NOT_IMPLEMENTED': return <XCircle className="h-4 w-4 text-red-500" />;
    case 'PARTIALLY_EFFECTIVE': case 'PARTIALLY_IMPLEMENTED': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'PLANNED': case 'IMPLEMENTED_UNVERIFIED': return <Clock className="h-4 w-4 text-blue-500" />;
    case 'NOT_APPLICABLE': return <Info className="h-4 w-4 text-gray-500" />;
    default: return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

export default function ReviewDetailPage() {
  const params = useParams();
  const reviewId = params?.id as string;
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ASSESSOR';

  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [editingAssessment, setEditingAssessment] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [actionDialog, setActionDialog] = useState(false);
  const [actionForm, setActionForm] = useState({ description: '', ownerId: '', dueDate: '', controlDefId: '' });
  const [users, setUsers] = useState<any[]>([]);

  const fetchReview = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}`);
      if (res.ok) setReview(await res.json());
    } catch {} finally { setLoading(false); }
  }, [reviewId]);

  useEffect(() => { fetchReview(); }, [fetchReview]);

  useEffect(() => {
    fetch('/api/users').then((r: any) => r?.ok ? r.json() : []).then(setUsers).catch(() => {});
  }, []);

  const assessments = review?.assessments ?? [];
  const maturity = calculateMaturity(assessments);
  const coverage = calculateCoverage(assessments);
  const verifiedEff = calculateVerifiedEffective(assessments);

  const filtered = assessments.filter((a: any) => {
    const cd = a?.controlDef;
    if (domainFilter !== 'all' && cd?.domain !== domainFilter) return false;
    if (stateFilter !== 'all' && a?.completionState !== stateFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        cd?.controlId?.toLowerCase()?.includes(q) ||
        cd?.controlName?.toLowerCase()?.includes(q) ||
        cd?.question?.toLowerCase()?.includes(q) ||
        cd?.domain?.toLowerCase()?.includes(q)
      );
    }
    return true;
  });

  const handleEditOpen = (assessment: any) => {
    setEditingAssessment(assessment);
    setEditForm({
      completionState: assessment?.completionState ?? 'NOT_ASSESSED',
      scope: assessment?.scope ?? '',
      controlOwner: assessment?.controlOwner ?? '',
      assessor: assessment?.assessor ?? '',
      findings: assessment?.findings ?? '',
      evidenceRefs: assessment?.evidenceRefs ?? '',
      testDate: assessment?.testDate ? new Date(assessment.testDate).toISOString().slice(0, 10) : '',
      naApproval: assessment?.naApproval ?? '',
    });
  };

  const handleSaveAssessment = async () => {
    if (!editingAssessment?.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/assessments/${editingAssessment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success('Assessment updated');
        setEditingAssessment(null);
        fetchReview();
      } else toast.error('Failed to save');
    } catch { toast.error('Failed'); } finally { setSaving(false); }
  };

  const handleCreateAction = async () => {
    if (!actionForm.description) { toast.error('Description required'); return; }
    try {
      const body: any = {
        reviewId,
        description: actionForm.description,
        dueDate: actionForm.dueDate || null,
        ownerId: actionForm.ownerId || null,
        controlDefId: actionForm.controlDefId || null,
      };
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Action created');
        setActionDialog(false);
        setActionForm({ description: '', ownerId: '', dueDate: '', controlDefId: '' });
        fetchReview();
      } else toast.error('Failed');
    } catch { toast.error('Failed'); }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  if (!review) return <div className="text-center py-12 text-muted-foreground">Review not found.</div>;

  return (
    <div>
      <PageHeader
        title={review?.name ?? 'Review'}
        description={`Review date: ${review?.reviewDate ? new Date(review.reviewDate).toLocaleDateString('en-GB', { dateStyle: 'long' }) : 'N/A'}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/export?reviewId=${reviewId}`, '_blank')}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/ics?reviewId=${reviewId}`, '_blank')}>
              <Calendar className="h-4 w-4 mr-2" /> .ics
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setActionDialog(true)}>
                <Plus className="h-4 w-4 mr-2" /> Action
              </Button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Coverage</div>
            <div className="text-2xl font-bold font-display">{(coverage * 100).toFixed(0)}%</div>
            <Progress value={coverage * 100} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Scored Maturity</div>
            <div className="text-2xl font-bold font-display">{(maturity * 100).toFixed(0)}%</div>
            <Progress value={maturity * 100} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Verified Effective</div>
            <div className="text-2xl font-bold font-display">{(verifiedEff * 100).toFixed(0)}%</div>
            <Progress value={verifiedEff * 100} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mt-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search controls..." value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} className="pl-10" />
        </div>
        <Select value={domainFilter} onValueChange={setDomainFilter}>
          <SelectTrigger className="w-[220px]"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="All domains" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {DOMAINS.map((d: string) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All states" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {COMPLETION_OPTIONS.map((o: any) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Assessments table */}
      <Card className="mt-4">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">ID</TableHead>
                <TableHead>Control</TableHead>
                <TableHead className="w-[200px]">Domain</TableHead>
                <TableHead className="w-[180px]">State</TableHead>
                <TableHead className="w-[60px]">Score</TableHead>
                <TableHead className="w-[120px]">Owner</TableHead>
                {canEdit && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a: any) => (
                <TableRow
                  key={a?.id}
                  className={canEdit ? 'cursor-pointer hover:bg-accent/50' : ''}
                  onClick={canEdit ? () => handleEditOpen(a) : undefined}
                >
                  <TableCell className="font-mono text-xs">{a?.controlDef?.controlId ?? ''}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{a?.controlDef?.controlName ?? ''}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{a?.controlDef?.question ?? ''}</div>
                  </TableCell>
                  <TableCell className="text-xs">{a?.controlDef?.domain ?? ''}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {stateIcon(a?.completionState)}
                      <span className="text-xs">{STATE_LABELS[a?.completionState] ?? a?.completionState}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{a?.score ?? '–'}</TableCell>
                  <TableCell className="text-xs">{a?.controlOwner ?? '–'}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 7 : 6} className="text-center py-8 text-muted-foreground">No controls match your filters.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Edit Assessment Dialog */}
      <Dialog open={!!editingAssessment} onOpenChange={(open: boolean) => { if (!open) setEditingAssessment(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{editingAssessment?.controlDef?.controlId}</span>
              {editingAssessment?.controlDef?.controlName}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="assess">
            <TabsList className="w-full">
              <TabsTrigger value="assess" className="flex-1">Assessment</TabsTrigger>
              <TabsTrigger value="detail" className="flex-1">Control Detail</TabsTrigger>
            </TabsList>

            <TabsContent value="assess" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Completion State</Label>
                  <Select value={editForm.completionState} onValueChange={(v: string) => setEditForm({ ...(editForm ?? {}), completionState: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPLETION_OPTIONS.map((o: any) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Test Date</Label>
                  <Input type="date" value={editForm.testDate ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), testDate: e?.target?.value ?? '' })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Control Owner</Label>
                  <Input value={editForm.controlOwner ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), controlOwner: e?.target?.value ?? '' })} placeholder="e.g. CISO" />
                </div>
                <div className="space-y-2">
                  <Label>Assessor</Label>
                  <Input value={editForm.assessor ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), assessor: e?.target?.value ?? '' })} placeholder="e.g. Internal Audit" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Scope / Sample / Review Period</Label>
                <Textarea value={editForm.scope ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), scope: e?.target?.value ?? '' })} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Evidence References</Label>
                <Textarea value={editForm.evidenceRefs ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), evidenceRefs: e?.target?.value ?? '' })} rows={2} placeholder="Document names, ticket IDs, screenshots..." />
              </div>
              <div className="space-y-2">
                <Label>Test Results / Findings</Label>
                <Textarea value={editForm.findings ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), findings: e?.target?.value ?? '' })} rows={3} />
              </div>
              {editForm.completionState === 'NOT_APPLICABLE' && (
                <div className="space-y-2">
                  <Label>N/A Approval & Justification</Label>
                  <Textarea value={editForm.naApproval ?? ''} onChange={(e: any) => setEditForm({ ...(editForm ?? {}), naApproval: e?.target?.value ?? '' })} rows={2} placeholder="Authorised by, reason..." />
                </div>
              )}
              <Button onClick={handleSaveAssessment} loading={saving} className="w-full">Save Assessment</Button>
            </TabsContent>

            <TabsContent value="detail" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">Assurance Question</div>
                  <p className="text-sm mt-1">{editingAssessment?.controlDef?.question ?? ''}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">Evidence Requirements</div>
                  <p className="text-sm mt-1">{editingAssessment?.controlDef?.evidenceReqs ?? ''}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">Test Procedure</div>
                  <p className="text-sm mt-1">{editingAssessment?.controlDef?.testProcedure ?? ''}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase">Pass Criteria</div>
                  <p className="text-sm mt-1">{editingAssessment?.controlDef?.passCriteria ?? ''}</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add Action Dialog */}
      <Dialog open={actionDialog} onOpenChange={setActionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Remediation Action</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={actionForm.description} onChange={(e: any) => setActionForm({ ...(actionForm ?? {}), description: e?.target?.value ?? '' })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select value={actionForm.ownerId} onValueChange={(v: string) => setActionForm({ ...(actionForm ?? {}), ownerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u: any) => <SelectItem key={u?.id} value={u?.id ?? ''}>{u?.name ?? u?.email ?? 'User'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={actionForm.dueDate} onChange={(e: any) => setActionForm({ ...(actionForm ?? {}), dueDate: e?.target?.value ?? '' })} />
              </div>
            </div>
            <Button onClick={handleCreateAction} className="w-full">Create Action</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
