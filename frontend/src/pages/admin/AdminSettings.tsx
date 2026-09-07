import React, { useState, useEffect } from 'react';
import { AlertTriangle, Send, AlertCircle, Info, Check } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { SectionCard, Skeleton, Spinner, Toggle } from '../../components/ui.js';
import type { AppConfig } from '../../types.js';

export const AdminSettings: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>({
    appName: 'AbyssGPT',
    maintenanceMode: false,
    maintenanceMessage: 'System is temporarily offline for scheduled maintenance. Please check back soon.',
    premiumPriceInr: 299,
    telegramContactUsername: '@MrNewton_2',
    updatedAt: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<AppConfig>('/api/admin/settings')
      .then((data) => setConfig(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update app settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="skeleton-title" style={{ width: '34%' }} />
        <div className="card card-pad space-y-4">
          <Skeleton className="skeleton-text" style={{ width: '38%' }} />
          <Skeleton className="skeleton-text" />
          <Skeleton className="skeleton-text" style={{ width: '82%' }} />
        </div>
        <div className="card card-pad space-y-4">
          <Skeleton className="skeleton-text" style={{ width: '38%' }} />
          <Skeleton className="skeleton-text" style={{ width: '90%' }} />
          <Skeleton className="skeleton-text" style={{ width: '64%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Application Configuration</h2>
        <p className="mt-0.5 text-xs text-ink-3">Maintenance controls, pricing display, and support contacts</p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />
              <span>Maintenance mode</span>
            </span>
          }
          description="Regular users cannot send messages while enabled and will see your custom notice. Admins bypass maintenance mode."
          action={
            <Toggle
              checked={config.maintenanceMode}
              onChange={(v) => setConfig({ ...config, maintenanceMode: v })}
              label="Toggle maintenance mode"
              danger
            />
          }
        >
          {config.maintenanceMode && (
            <div className="alert alert-warning" role="status">
              <Info className="h-4 w-4" />
              <span>Maintenance mode is currently active — regular users are blocked from chatting.</span>
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="maintenance-message">
              Maintenance message
            </label>
            <textarea
              id="maintenance-message"
              rows={2}
              value={config.maintenanceMessage}
              onChange={(e) => setConfig({ ...config, maintenanceMessage: e.target.value })}
              className="field"
              style={{ minHeight: 68 }}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Premium subscription"
          description="Values shown on the user-facing Premium page."
          action={<span className="badge badge-warning">Pro</span>}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="premium-price">
                Display price (INR)
              </label>
              <div className="field-icon-wrap">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">₹</span>
                <input
                  id="premium-price"
                  type="number"
                  min={0}
                  value={config.premiumPriceInr}
                  onChange={(e) => setConfig({ ...config, premiumPriceInr: Number(e.target.value) })}
                  className="field tabular"
                  style={{ paddingLeft: 30 }}
                />
              </div>
              <p className="field-hint">Shown as the monthly price on the Premium page</p>
            </div>

            <div>
              <label className="field-label" htmlFor="telegram-handle">
                Telegram support handle
              </label>
              <div className="field-icon-wrap">
                <Send className="h-3.5 w-3.5" size={14} />
                <input
                  id="telegram-handle"
                  type="text"
                  value={config.telegramContactUsername}
                  onChange={(e) => setConfig({ ...config, telegramContactUsername: e.target.value })}
                  placeholder="@username"
                  className="field"
                />
              </div>
              <p className="field-hint">Where users go for manual activation</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="General" description="Core branding values used across the product.">
          <div className="max-w-sm">
            <label className="field-label" htmlFor="app-name">
              Application name
            </label>
            <input
              id="app-name"
              type="text"
              value={config.appName}
              onChange={(e) => setConfig({ ...config, appName: e.target.value })}
              className="field"
            />
          </div>
        </SectionCard>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {success ? <Check className="h-4 w-4" /> : saving ? <Spinner size={14} /> : null}
            <span>{success ? 'Settings saved' : saving ? 'Saving…' : 'Save configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
