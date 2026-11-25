export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const reviewId = url.searchParams.get('reviewId');

  const where: any = { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { not: null } };
  if (reviewId) where.reviewId = reviewId;

  const actions = await prisma.action.findMany({
    where,
    include: { review: { select: { name: true } } },
  });

  const events = (actions ?? []).map((a: any) => {
    const due = a?.dueDate ? new Date(a.dueDate) : new Date();
    const uid = a?.id ?? 'unknown';
    return `BEGIN:VEVENT
UID:${uid}@cyber-assurance
DTSTART;VALUE=DATE:${due.toISOString().slice(0, 10).replace(/-/g, '')}
DTEND;VALUE=DATE:${due.toISOString().slice(0, 10).replace(/-/g, '')}
SUMMARY:Action Due: ${(a?.description ?? '').slice(0, 60)}
DESCRIPTION:Review: ${a?.review?.name ?? 'Unknown'}\nStatus: ${a?.status ?? 'Unknown'}
END:VEVENT`;
  });

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Cyber Assurance//Actions//EN
CALSCALE:GREGORIAN
${events.join('\n')}
END:VCALENDAR`;

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar',
      'Content-Disposition': 'attachment; filename="actions.ics"',
    },
  });
}
