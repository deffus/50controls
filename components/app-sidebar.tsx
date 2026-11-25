'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import {
  LayoutDashboard, ClipboardCheck, ListTodo, Users, Bell, Shield, LogOut, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/reviews', label: 'Reviews', icon: ClipboardCheck },
  { href: '/actions', label: 'Actions', icon: ListTodo },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

const ADMIN_ITEMS = [
  { href: '/admin/users', label: 'User Management', icon: Users },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as any;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session?.user) return;
    const fetchNotifs = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setUnreadCount((data ?? []).filter((n: any) => !n?.read).length);
        }
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [session?.user]);

  return (
    <>
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-7 w-7 text-primary" />
        <span className="font-display text-lg font-bold tracking-tight">Cyber Assurance</span>
      </div>

      <nav className="space-y-1 flex-1">
        {NAV_ITEMS.map((item: any) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}>
                <Icon className="h-4 w-4" />
                {item.label}
                {item.href === '/notifications' && unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0">{unreadCount}</Badge>
                )}
              </div>
            </Link>
          );
        })}

        {user?.role === 'ADMIN' && (
          <>
            <div className="pt-4 pb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3">Admin</span>
            </div>
            {ADMIN_ITEMS.map((item: any) => {
              const Icon = item.icon;
              const active = pathname?.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    active ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="mt-auto pt-4 border-t border-border space-y-2">
        <div className="flex items-center justify-between px-3">
          <span className="text-sm text-muted-foreground truncate">{user?.name ?? user?.email ?? 'User'}</span>
          <ThemeToggle />
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => signOut?.({ redirectTo: '/login' })}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </>
  );
}
