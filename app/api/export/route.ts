export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { STATE_LABELS } from '@/lib/scoring';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const reviewId = url.searchParams.get('reviewId');
  if (!reviewId) return NextResponse.json({ error: 'reviewId required' }, { status: 400 });

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      assessments: {
        include: { controlDef: true },
        orderBy: { controlDef: { sortOrder: 'asc' } },
      },
    },
  });
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

  const headers = [
    'Control ID', 'Domain', 'Control', 'Assurance Question',
    'Completion State', 'Score', 'Scope', 'Control Owner',
    'Assessor', 'Evidence References', 'Test Results / Findings',
    'N/A Approval'
  ];
  const rows = (review.assessments ?? []).map((a: any) => [
    a?.controlDef?.controlId ?? '',
    a?.controlDef?.domain ?? '',
    a?.controlDef?.controlName ?? '',
    a?.controlDef?.question ?? '',
    STATE_LABELS[a?.completionState] ?? a?.completionState ?? '',
    a?.score ?? '',
    a?.scope ?? '',
    a?.controlOwner ?? '',
    a?.assessor ?? '',
    a?.evidenceRefs ?? '',
    a?.findings ?? '',
    a?.naApproval ?? '',
  ]);

  const csv = [headers, ...rows]
    .map((row: any[]) => row.map((cell: any) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${review.name?.replace(/[^a-zA-Z0-9]/g, '_') ?? 'review'}_export.csv"`,
    },
  });
}
