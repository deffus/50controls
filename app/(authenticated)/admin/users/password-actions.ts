'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { passwordSchema } from '@/lib/user-validation';
import bcrypt from 'bcryptjs';

export async function resetUserPassword(id: string, password: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') return { error: 'Administrator access required.' };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success || typeof id !== 'string' || !id) return { error: parsed.success ? 'Invalid user.' : parsed.error.issues[0].message };
  try {
    await prisma.user.update({ where: { id }, data: { password: await bcrypt.hash(parsed.data, 12) } });
    return { success: true, signOut: id === session.user.id };
  } catch (error: any) {
    if (error.code === 'P2025') return { error: 'User no longer exists.' };
    console.error('Password reset failed:', error);
    return { error: 'Password reset failed. Please retry.' };
  }
}
