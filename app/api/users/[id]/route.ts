export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { editUserSchema, publicUserFields } from '@/lib/user-validation';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const { id } = await params;
  const parsed = editUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  if (id === session.user.id && parsed.data.role && parsed.data.role !== 'ADMIN') {
    return NextResponse.json({ error: 'You cannot remove your own administrator access.' }, { status: 400 });
  }
  try {
    if (parsed.data.email) {
      const existing = await prisma.user.findFirst({ where: { email: { equals: parsed.data.email, mode: 'insensitive' }, NOT: { id } }, select: { id: true } });
      if (existing) return NextResponse.json({ error: 'That email address is already registered.' }, { status: 409 });
    }
    const updated = await prisma.user.update({ where: { id }, data: parsed.data, select: publicUserFields });
    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.code === 'P2025') return NextResponse.json({ error: 'User no longer exists.' }, { status: 404 });
    if (error.code === 'P2002') return NextResponse.json({ error: 'That email address is already registered.' }, { status: 409 });
    console.error('User update failed:', error);
    return NextResponse.json({ error: 'Could not save the user. Please retry.' }, { status: 500 });
  }
}
