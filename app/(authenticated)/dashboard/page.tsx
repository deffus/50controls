'use client';

import { AbacusDashboard, useDashboardData } from '@/components/viz/abacus-dashboard';
import { manifest } from '@/lib/dashboard-manifest';

export default function DashboardPage() {
  const { data, dataAsOf, error } = useDashboardData('/api/dashboard', 60_000);

  return (
    <AbacusDashboard
      manifest={manifest}
      data={data}
      dataAsOf={dataAsOf}
      className="min-h-screen"
    />
  );
}
