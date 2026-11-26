export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { getScore } from '@/lib/scoring';
import { assessmentPatchSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (!['ADMIN', 'ASSESSOR'].includes(user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const parsed = assessmentPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid assessment changes' }, { status: 400 });
  }

  const { id } = await params;
  try {
    const assessment = await prisma.$transaction(async (tx) => {
      const current = await tx.controlAssessment.findUniqueOrThrow({ where: { id } });
      const state = parsed.data.completionState ?? current.completionState;
      return tx.controlAssessment.update({
        where: { id },
        data: {
          ...parsed.data,
          completionState: state,
          score: getScore(state),
          assessedById: user.id,
        },
        include: { controlDef: true },
      });
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json(assessment);
  } catch (error) {
    return mutationError(error);
  }
}
