export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { getScore } from '@/lib/scoring';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (user.role === 'VIEWER') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  const { id } = await params;
  const data = await request.json();

  // Auto-calculate score from completionState
  if (data.completionState) {
    data.score = getScore(data.completionState);
  }
  if (data.testDate) {
    data.testDate = new Date(data.testDate);
  }

  data.assessedById = user.id;

  const assessment = await prisma.controlAssessment.update({
    where: { id },
    data,
    include: { controlDef: true },
  });
  return NextResponse.json(assessment);
}
