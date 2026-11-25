export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const now = new Date();
    const inWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Overdue actions
    const overdueActions = await prisma.action.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: now } },
      include: { owner: { select: { id: true, name: true, email: true } }, review: { select: { name: true } } },
    });

    // Due soon actions
    const dueSoonActions = await prisma.action.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { gte: now, lte: inWeek } },
      include: { owner: { select: { id: true, name: true, email: true } }, review: { select: { name: true } } },
    });

    // Create in-app notifications
    const notifications: any[] = [];
    for (const action of overdueActions) {
      if (action?.ownerId) {
        notifications.push({
          userId: action.ownerId,
          title: 'Overdue Action',
          message: `Action "${(action?.description ?? '').slice(0, 80)}" from review "${action?.review?.name ?? 'Unknown'}" is overdue.`,
          link: '/actions?filter=overdue',
        });
      }
    }
    for (const action of dueSoonActions) {
      if (action?.ownerId) {
        notifications.push({
          userId: action.ownerId,
          title: 'Action Due Soon',
          message: `Action "${(action?.description ?? '').slice(0, 80)}" from review "${action?.review?.name ?? 'Unknown'}" is due within 7 days.`,
          link: '/actions?filter=due-soon',
        });
      }
    }

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }

    // Send email reminders
    const appUrl = process.env.NEXTAUTH_URL ?? '';
    const appName = appUrl ? new URL(appUrl).hostname.split('.')[0] : 'Cyber Assurance';

    // Group by owner for emails
    const ownerOverdue = new Map<string, any[]>();
    for (const action of overdueActions) {
      if (action?.owner?.email) {
        const list = ownerOverdue.get(action.owner.email) ?? [];
        list.push(action);
        ownerOverdue.set(action.owner.email, list);
      }
    }

    for (const [email, actions] of ownerOverdue) {
      const actionList = actions.map((a: any) => `<li>${a?.description ?? 'Unknown action'} (due: ${a?.dueDate ? new Date(a.dueDate).toLocaleDateString('en-GB') : 'N/A'})</li>`).join('');
      try {
        await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}` },
          body: JSON.stringify({
            app_id: process.env.WEB_APP_ID,
            notification_id: process.env.NOTIF_ID_OVERDUE_ACTION_REMINDER,
            subject: `Overdue Actions Reminder - ${actions.length} action(s)`,
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#ef4444">Overdue Actions</h2><p>The following actions are past their due date:</p><ul>${actionList}</ul><p><a href="${appUrl}/actions?filter=overdue">View in Cyber Assurance</a></p></div>`,
            is_html: true,
            recipient_email: email,
            sender_email: `noreply@${appUrl ? new URL(appUrl).hostname : 'app'}`,
            sender_alias: appName,
          }),
        });
      } catch (e: any) {
        console.error('Failed to send overdue email to', email, e);
      }
    }

    const ownerDueSoon = new Map<string, any[]>();
    for (const action of dueSoonActions) {
      if (action?.owner?.email) {
        const list = ownerDueSoon.get(action.owner.email) ?? [];
        list.push(action);
        ownerDueSoon.set(action.owner.email, list);
      }
    }

    for (const [email, actions] of ownerDueSoon) {
      const actionList = actions.map((a: any) => `<li>${a?.description ?? 'Unknown action'} (due: ${a?.dueDate ? new Date(a.dueDate).toLocaleDateString('en-GB') : 'N/A'})</li>`).join('');
      try {
        await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}` },
          body: JSON.stringify({
            app_id: process.env.WEB_APP_ID,
            notification_id: process.env.NOTIF_ID_DUE_SOON_ACTION_REMINDER,
            subject: `Actions Due Soon - ${actions.length} action(s)`,
            body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#f59e0b">Actions Due Soon</h2><p>The following actions are due within 7 days:</p><ul>${actionList}</ul><p><a href="${appUrl}/actions?filter=due-soon">View in Cyber Assurance</a></p></div>`,
            is_html: true,
            recipient_email: email,
            sender_email: `noreply@${appUrl ? new URL(appUrl).hostname : 'app'}`,
            sender_alias: appName,
          }),
        });
      } catch (e: any) {
        console.error('Failed to send due-soon email to', email, e);
      }
    }

    return NextResponse.json({
      success: true,
      overdueNotified: overdueActions.length,
      dueSoonNotified: dueSoonActions.length,
    });
  } catch (err: any) {
    console.error('Reminder check error:', err);
    return NextResponse.json({ error: 'Reminder check failed' }, { status: 500 });
  }
}
