export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { reviewPatchSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      assessments: {
        include: { controlDef: true },
        orderBy: { controlDef: { sortOrder: 'asc' } },
      },
      actions: {
        include: { owner: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(review);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (!['ADMIN', 'ASSESSOR'].includes(user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const parsed = reviewPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid review changes' }, { status: 400 });
  }
  const { id } = await params;
  try {
    const review = await prisma.review.update({ where: { id }, data: parsed.data });
    return NextResponse.json(review);
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const { id } = await params;
  await prisma.review.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
