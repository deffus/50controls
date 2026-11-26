export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { actionPatchSchema } from '@/lib/assurance-validation';
import { mutationError } from '@/lib/mutation-error';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = session.user as any;
  if (!['ADMIN', 'ASSESSOR'].includes(user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const parsed = actionPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action changes' }, { status: 400 });
  }
  const { id } = await params;
  try {
    const current = await prisma.action.findUnique({
      where: { id },
      select: { status: true, closedDate: true },
    });
    if (!current) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const data = { ...parsed.data };
    if (data.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: data.ownerId },
        select: { id: true },
      });
      if (!owner) {
        return NextResponse.json({ error: 'Invalid owner' }, { status: 400 });
      }
    }
    const nextStatus = data.status ?? current.status;
    data.closedDate = nextStatus === 'CLOSED'
      ? (data.closedDate ?? current.closedDate ?? new Date())
      : null;

    const action = await prisma.action.update({
      where: { id },
      data,
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(action);
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
  await prisma.action.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
