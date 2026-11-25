export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

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
  if (user.role === 'VIEWER') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  const data = await request.json();
  if (!data.reviewId || !data.description) {
    return NextResponse.json({ error: 'Review ID and description required' }, { status: 400 });
  }
  if (data.dueDate) data.dueDate = new Date(data.dueDate);

  const action = await prisma.action.create({
    data,
    include: { owner: { select: { name: true, email: true } } },
  });
  return NextResponse.json(action, { status: 201 });
}
