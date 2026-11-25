export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import bcrypt from 'bcryptjs';
import { createUserSchema, publicUserFields } from '@/lib/user-validation';

// Also used by review/action owner selectors; preserve authenticated directory access.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const users = await prisma.user.findMany({ select: publicUserFields, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const { password, ...profile } = parsed.data;
    const existing = await prisma.user.findFirst({ where: { email: { equals: profile.email, mode: 'insensitive' } }, select: { id: true } });
    if (existing) return NextResponse.json({ error: 'That email address is already registered.' }, { status: 409 });
    const user = await prisma.user.create({ data: { ...profile, password: await bcrypt.hash(password, 12) }, select: publicUserFields });
    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') return NextResponse.json({ error: 'That email address is already registered.' }, { status: 409 });
    console.error('User creation failed:', error);
    return NextResponse.json({ error: 'Could not create the user. Please retry.' }, { status: 500 });
  }
}
