'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { SafeDate } from '@/components/safe-format';
import Link from 'next/link';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) setNotifications(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchNotifs(); }, []);

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      toast.success('All marked as read');
      fetchNotifs();
    } catch { toast.error('Failed'); }
  };

  const unreadCount = (notifications ?? []).filter((n: any) => !n?.read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="In-app alerts for overdue and due-soon actions."
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4 mr-2" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="space-y-3 mt-6">{[1,2,3].map((i: number) => <Skeleton key={i} className="h-20" />)}</div>
      ) : notifications.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No notifications yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 mt-6">
          {notifications.map((n: any) => (
            <Card key={n?.id} className={`transition-colors ${!n?.read ? 'border-primary/30 bg-primary/5' : ''}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{n?.title ?? ''}</span>
                      {!n?.read && <Badge variant="default" className="text-xs px-1.5 py-0">New</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n?.message ?? ''}</p>
                    <div className="text-xs text-muted-foreground mt-1">
                      <SafeDate date={n?.createdAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} />
                    </div>
                  </div>
                  {n?.link && (
                    <Link href={n.link}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
