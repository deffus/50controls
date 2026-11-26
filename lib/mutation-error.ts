import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

export function mutationError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error.code === 'P2003') {
      return NextResponse.json({ error: 'Invalid linked record' }, { status: 400 });
    }
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Conflicting record' }, { status: 409 });
    }
  }
  console.error('Assurance mutation failed', {
    type: error instanceof Error ? error.name : 'UnknownError',
  });
  return NextResponse.json({ error: 'Unable to save changes' }, { status: 500 });
}
