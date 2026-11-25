export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (user.role === 'VIEWER') return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  const { id } = await params;
  const data = await request.json();
  if (data.dueDate) data.dueDate = new Date(data.dueDate);
  if (data.closedDate) data.closedDate = new Date(data.closedDate);
  if (data.status === 'CLOSED' && !data.closedDate) data.closedDate = new Date();

  const action = await prisma.action.update({
    where: { id },
    data,
    include: { owner: { select: { name: true, email: true } } },
  });
  return NextResponse.json(action);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const { id } = await params;
  await prisma.action.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
