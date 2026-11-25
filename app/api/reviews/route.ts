export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const reviews = await prisma.review.findMany({
    orderBy: { reviewDate: 'desc' },
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { assessments: true, actions: true } },
    },
  });
  return NextResponse.json(reviews);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (user.role === 'VIEWER') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  try {
    const { name, reviewDate, description, copyFromReviewId } = await request.json();
    if (!name || !reviewDate) return NextResponse.json({ error: 'Name and review date required' }, { status: 400 });

    const review = await prisma.review.create({
      data: { name, reviewDate: new Date(reviewDate), description, createdById: user.id },
    });

    // Get all control definitions
    const controls = await prisma.controlDefinition.findMany({ orderBy: { sortOrder: 'asc' } });

    if (copyFromReviewId) {
      // Copy assessments from previous review
      const prevAssessments = await prisma.controlAssessment.findMany({
        where: { reviewId: copyFromReviewId },
      });
      const prevMap = new Map(prevAssessments.map((a: any) => [a.controlDefId, a]));
      await prisma.controlAssessment.createMany({
        data: controls.map((c: any) => {
          const prev = prevMap.get(c.id);
          return {
            reviewId: review.id,
            controlDefId: c.id,
            completionState: prev?.completionState ?? 'NOT_ASSESSED',
            score: prev?.score ?? null,
            scope: prev?.scope ?? null,
            controlOwner: prev?.controlOwner ?? null,
            assessor: prev?.assessor ?? null,
            findings: prev?.findings ?? null,
            evidenceRefs: prev?.evidenceRefs ?? null,
            naApproval: prev?.naApproval ?? null,
          };
        }),
      });
    } else {
      // Create blank assessments for all controls
      await prisma.controlAssessment.createMany({
        data: controls.map((c: any) => ({
          reviewId: review.id,
          controlDefId: c.id,
          completionState: 'NOT_ASSESSED',
        })),
      });
    }

    return NextResponse.json(review, { status: 201 });
  } catch (err: any) {
    console.error('Create review error:', err);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}
