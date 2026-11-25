export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { email: rawEmail, password, name } = await request.json();
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!email || typeof password !== 'string' || !password || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }
    const hashed = await bcrypt.hash(password, 12);
    // First user becomes ADMIN
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'ADMIN' : 'VIEWER';
    const user = await prisma.user.create({
      data: { email, password: hashed, name, role },
    });
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role }, { status: 201 });
  } catch (err: any) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}
