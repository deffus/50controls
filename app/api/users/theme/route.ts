export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { themePref } = await request.json();
  const user = session.user as any;
  await prisma.user.update({
    where: { id: user.id },
    data: { themePref },
  });
  return NextResponse.json({ success: true });
}
