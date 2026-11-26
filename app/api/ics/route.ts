export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { escapeIcalText, foldIcalLine } from '@/lib/ical';

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

  const events: string[] = [];
  for (const a of actions ?? []) {
    const due = a?.dueDate ? new Date(a.dueDate) : new Date();
    const uid = a?.id ?? 'unknown';
    const dateStr = due.toISOString().slice(0, 10).replace(/-/g, '');
    const summary = escapeIcalText(`Action Due: ${(a?.description ?? '').slice(0, 60)}`);
    const description = escapeIcalText(`Review: ${a?.review?.name ?? 'Unknown'}\nStatus: ${a?.status ?? 'Unknown'}`);

    const lines = [
      'BEGIN:VEVENT',
      foldIcalLine(`UID:${uid}@cyber-assurance`),
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${dateStr}`,
      foldIcalLine(`SUMMARY:${summary}`),
      foldIcalLine(`DESCRIPTION:${description}`),
      'END:VEVENT',
    ];
    events.push(lines.join('\r\n'));
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cyber Assurance//Actions//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'attachment; filename="actions.ics"',
    },
  });
}
