export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { actionCreateSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const reviewId = url.searchParams.get('reviewId');
  const status = url.searchParams.get('status');
  const filter = url.searchParams.get('filter'); // 'overdue' | 'due-soon'

  const where: any = {};
  if (reviewId) where.reviewId = reviewId;
  if (status) where.status = status;
  if (filter === 'overdue') {
    where.dueDate = { lt: new Date() };
    where.status = { in: ['OPEN', 'IN_PROGRESS'] };
  } else if (filter === 'due-soon') {
    const now = new Date();
    const inWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    where.dueDate = { gte: now, lte: inWeek };
    where.status = { in: ['OPEN', 'IN_PROGRESS'] };
  }

  const actions = await prisma.action.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      review: { select: { name: true } },
    },
    orderBy: { dueDate: 'asc' },
  });
  return NextResponse.json(actions);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (!['ADMIN', 'ASSESSOR'].includes(user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const parsed = actionCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action data' }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const review = await prisma.review.findUnique({
      where: { id: data.reviewId },
      select: { id: true },
    });
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }
    if (data.ownerId && !await prisma.user.findUnique({
      where: { id: data.ownerId },
      select: { id: true },
    })) {
      return NextResponse.json({ error: 'Invalid owner' }, { status: 400 });
    }
    if (data.controlDefId && !await prisma.controlDefinition.findUnique({
      where: { id: data.controlDefId },
      select: { id: true },
    })) {
      return NextResponse.json({ error: 'Invalid control' }, { status: 400 });
    }

    const action = await prisma.action.create({
      data: { ...data, status: 'OPEN' },
      include: { owner: { select: { name: true, email: true } } },
    });
    return NextResponse.json(action, { status: 201 });
  } catch (error) {
    return mutationError(error);
  }
}
