import React, { useState, useEffect } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { SectionCard, Skeleton, Spinner } from '../../components/ui.js';
import type { TierLimitsConfig } from '../../types.js';

export const AdminLimits: React.FC = () => {
  const [limits, setLimits] = useState<TierLimitsConfig>({
    free: { dailyLimit: 20, rateLimit: 5, contextLimit: 10 },
    premium: { dailyLimit: 200, rateLimit: 30, contextLimit: 30 },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<TierLimitsConfig>('/api/admin/limits')
      .then((data) => setLimits(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load limits'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/admin/limits', {
        method: 'PUT',
        body: JSON.stringify(limits),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update tier limits');
    } finally {
      setSaving(false);
    }
  };

  const numberField = (
    id: string,
    label: string,
    hint: string,
    value: number,
    onChange: (v: number) => void
  ) => (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="field tabular"
      />
      <p className="field-hint">{hint}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="skeleton-title" style={{ width: '34%' }} />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="card card-pad space-y-4">
            <Skeleton className="skeleton-text" style={{ width: '40%' }} />
            <Skeleton className="skeleton-text" />
            <Skeleton className="skeleton-text" style={{ width: '86%' }} />
            <Skeleton className="skeleton-text" style={{ width: '70%' }} />
          </div>
          <div className="card card-pad space-y-4">
            <Skeleton className="skeleton-text" style={{ width: '40%' }} />
            <Skeleton className="skeleton-text" />
            <Skeleton className="skeleton-text" style={{ width: '86%' }} />
            <Skeleton className="skeleton-text" style={{ width: '70%' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Limits & Quota Rules</h2>
        <p className="mt-0.5 text-xs text-ink-3">
          System-wide daily limits, per-minute rate throttling, and context history depth
        </p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SectionCard title="Free tier" description="Applied to every non-premium account." action={<span className="badge badge-neutral">Default</span>}>
            {numberField(
              'free-daily',
              'Daily message limit',
              'Queries allowed per day',
              limits.free.dailyLimit,
              (v) => setLimits({ ...limits, free: { ...limits.free, dailyLimit: v } })
            )}
            {numberField(
              'free-rate',
              'Rate limit (per minute)',
              'Requests per 60-second window',
              limits.free.rateLimit,
              (v) => setLimits({ ...limits, free: { ...limits.free, rateLimit: v } })
            )}
            {numberField(
              'free-context',
              'Context messages depth',
              'Recent messages included in reasoning',
              limits.free.contextLimit,
              (v) => setLimits({ ...limits, free: { ...limits.free, contextLimit: v } })
            )}
          </SectionCard>

          <SectionCard
            title="Premium tier"
            description="Applied to active Pro subscribers."
            action={<span className="badge badge-warning">Pro</span>}
          >
            {numberField(
              'premium-daily',
              'Daily message limit',
              'High-volume ceiling for subscribers',
              limits.premium.dailyLimit,
              (v) => setLimits({ ...limits, premium: { ...limits.premium, dailyLimit: v } })
            )}
            {numberField(
              'premium-rate',
              'Rate limit (per minute)',
              'High-frequency throughput',
              limits.premium.rateLimit,
              (v) => setLimits({ ...limits, premium: { ...limits.premium, rateLimit: v } })
            )}
            {numberField(
              'premium-context',
              'Context messages depth',
              'Extended history passed to reasoning',
              limits.premium.contextLimit,
              (v) => setLimits({ ...limits, premium: { ...limits.premium, contextLimit: v } })
            )}
          </SectionCard>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {success ? <Check className="h-4 w-4" /> : saving ? <Spinner size={14} /> : <Save className="h-4 w-4" />}
            <span>{success ? 'Tier limits updated' : saving ? 'Saving…' : 'Save tier limits'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
