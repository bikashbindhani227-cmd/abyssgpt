import React, { useState, useEffect, useCallback } from 'react';
import { Users, Crown, MessageSquare, AlertTriangle, Activity, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { Skeleton, Spinner } from '../../components/ui.js';
import type { AdminDashboardStats } from '../../types.js';

interface AdminDashboardProps {
  onNavigateUsers: () => void;
}

interface StatCardSpec {
  label: string;
  value?: number;
  icon: React.ComponentType<{ size?: number }>;
  tone: string;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateUsers }) => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(() => {
    setLoading(true);
    setError(null);
    apiRequest<AdminDashboardStats>('/api/admin/dashboard')
      .then((data) => setStats(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const cards: StatCardSpec[] = [
    { label: 'Total Users', value: stats?.totalUsers, icon: Users, tone: 'var(--accent)' },
    { label: 'Premium Members', value: stats?.premiumUsers, icon: Crown, tone: 'var(--warning)' },
    { label: 'Free Tier Users', value: stats?.freeUsers, icon: Users, tone: 'var(--text-2)' },
    { label: 'Active Today', value: stats?.activeUsersToday, icon: Activity, tone: 'var(--success)' },
    { label: 'Messages Today', value: stats?.messagesToday, icon: MessageSquare, tone: 'var(--accent-strong)' },
    { label: 'Suspended', value: stats?.bannedUsers, icon: AlertTriangle, tone: 'var(--error)' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">System Overview</h2>
          <p className="mt-0.5 text-xs text-ink-3">Real-time platform metrics and health</p>
        </div>

        <button onClick={fetchStats} disabled={loading} className="btn btn-soft btn-sm">
          <RefreshCw className={`h-3.5 w-3.5${loading ? ' spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span className="flex-1">{error}</span>
          <button onClick={fetchStats} className="btn btn-sm btn-soft">
            Retry
          </button>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !stats
          ? cards.map((c) => (
              <div key={c.label} className="card flex items-center justify-between p-5">
                <div className="flex-1">
                  <Skeleton className="skeleton-text" style={{ width: '62%', marginBottom: 10 }} />
                  <Skeleton style={{ width: 52, height: 26 }} />
                </div>
                <Skeleton style={{ width: 46, height: 46, borderRadius: 14 }} />
              </div>
            ))
          : cards.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="card flex items-center justify-between p-5 transition-shadow hover:shadow-md">
                <div>
                  <span className="text-xs font-semibold text-ink-3">{label}</span>
                  <div className="tabular mt-1 text-2xl font-bold text-ink">{value ?? '—'}</div>
                </div>
                <div
                  className="grid h-[46px] w-[46px] place-items-center rounded-[14px] border"
                  style={{
                    color: tone,
                    background: `color-mix(in srgb, ${tone} 10%, transparent)`,
                    borderColor: `color-mix(in srgb, ${tone} 22%, transparent)`,
                  }}
                  aria-hidden="true"
                >
                  <Icon size={19} />
                </div>
              </div>
            ))}
      </div>

      {/* Quick action */}
      <div className="card flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="h-4 w-4" style={{ color: 'var(--success)' }} />
            <span>Manage users & subscriptions</span>
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">
            Search users, grant or revoke premium status, reset message quotas, or override individual limits.
          </p>
        </div>

        <button onClick={onNavigateUsers} className="btn btn-primary shrink-0">
          <span>Open user management</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {loading && stats && (
        <p className="flex items-center justify-center gap-2 text-xs text-ink-3">
          <Spinner size={13} />
          <span>Updating metrics…</span>
        </p>
      )}
    </div>
  );
};
