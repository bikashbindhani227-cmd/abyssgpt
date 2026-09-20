import React, { useState, useEffect } from 'react';
import { AlertTriangle, Send, AlertCircle, Info, Check, Mail, Radio, Megaphone } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { SectionCard, Skeleton, Spinner, Toggle } from '../../components/ui.js';
import type { AppConfig } from '../../types.js';

interface EmailStatus {
  configured: boolean;
  host: string;
  user: string;
  from: string;
}

export const AdminSettings: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>({
    appName: 'AbyssGPT',
    maintenanceMode: false,
    maintenanceMessage: 'System is temporarily offline for scheduled maintenance. Please check back soon.',
    premiumPriceInr: 299,
    telegramContactUsername: '@MrNewton_2',
    adsEnabled: true,
    adsProvider: 'banner',
    adsenseClientId: '',
    adsenseSlotId: '',
    customAdScript: '',
    sponsorBannerUrl: '',
    sponsorLinkUrl: 'https://telegram.me/MrNewton_2',
    sponsorTitle: 'AbyssGPT Partner',
    sponsorText: 'Reach thousands of active AI users. Contact to sponsor or upgrade to Pro for zero ads.',
    updatedAt: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    Promise.all([
      apiRequest<AppConfig>('/api/admin/settings').then((data) => setConfig(data)),
      apiRequest<EmailStatus>('/api/admin/email-status').then((status) => setEmailStatus(status)).catch(() => {}),
    ])
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail || !testEmail.includes('@')) {
      setTestResult({ success: false, message: 'Please enter a valid email address.' });
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/send-test-email', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail }),
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to dispatch test email',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleBroadcastActive = async () => {
    if (!window.confirm('Broadcast an "I am active" notification email to all registered users now?')) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await apiRequest<{ totalUsers: number; processed: number }>('/api/admin/broadcast-active', {
        method: 'POST',
      });
      setBroadcastResult({
        success: true,
        message: `Dispatched active notification to ${res.processed} of ${res.totalUsers} registered users.`,
      });
    } catch (err: unknown) {
      setBroadcastResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to broadcast active notification',
      });
    } finally {
      setBroadcasting(false);
    }
  };

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

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Megaphone size={15} style={{ color: 'var(--accent)' }} />
              <span>Ads &amp; Monetization (Google AdSense / Custom Scripts / Sponsor Banner)</span>
            </span>
          }
          description="Display ads to Free users across the website (Sidebar and Welcome Screen). Pro users enjoy a 100% Ad-Free experience."
          action={
            <Toggle
              checked={config.adsEnabled ?? true}
              onChange={(checked) => setConfig({ ...config, adsEnabled: checked })}
              label="Enable Ads"
            />
          }
        >
          {(config.adsEnabled ?? true) && (
            <div className="space-y-4">
              <div>
                <label className="field-label" htmlFor="ads-provider">
                  Ad Network / Provider
                </label>
                <select
                  id="ads-provider"
                  value={config.adsProvider || 'banner'}
                  onChange={(e) => setConfig({ ...config, adsProvider: e.target.value as 'adsense' | 'custom' | 'banner' })}
                  className="field"
                >
                  <option value="adsense">Google AdSense (Auto Ads &amp; Display Units)</option>
                  <option value="custom">Custom Ad Script (Monetag, Adsterra, PropellerAds, HTML code)</option>
                  <option value="banner">Direct Sponsor Banner / Affiliate Promotion</option>
                </select>
                <p className="field-hint">Select your monetization source</p>
              </div>

              {config.adsProvider === 'adsense' && (
                <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3.5">
                  <div className="text-xs font-semibold text-ink">Google AdSense Configuration</div>
                  <div>
                    <label className="field-label" htmlFor="adsense-client-id">
                      AdSense Publisher Client ID
                    </label>
                    <input
                      id="adsense-client-id"
                      type="text"
                      value={config.adsenseClientId || ''}
                      onChange={(e) => setConfig({ ...config, adsenseClientId: e.target.value })}
                      placeholder="ca-pub-1234567890123456"
                      className="field"
                    />
                    <p className="field-hint">Your publisher ID from Google AdSense console</p>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="adsense-slot-id">
                      Display Ad Slot ID (Optional)
                    </label>
                    <input
                      id="adsense-slot-id"
                      type="text"
                      value={config.adsenseSlotId || ''}
                      onChange={(e) => setConfig({ ...config, adsenseSlotId: e.target.value })}
                      placeholder="1234567890"
                      className="field"
                    />
                    <p className="field-hint">Leave blank to let Google AdSense Auto Ads handle placement</p>
                  </div>
                </div>
              )}

              {config.adsProvider === 'custom' && (
                <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3.5">
                  <div className="text-xs font-semibold text-ink">Custom Ad Code (Monetag / Adsterra / Scripts)</div>
                  <div>
                    <label className="field-label" htmlFor="custom-ad-script">
                      Script Tag or HTML Embed Code
                    </label>
                    <textarea
                      id="custom-ad-script"
                      rows={4}
                      value={config.customAdScript || ''}
                      onChange={(e) => setConfig({ ...config, customAdScript: e.target.value })}
                      placeholder="Paste your ad network script tag or banner HTML here..."
                      className="field font-mono text-xs"
                    />
                    <p className="field-hint">Injected directly for free users; pro users remain completely ad-free.</p>
                  </div>
                </div>
              )}

              {config.adsProvider === 'banner' && (
                <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3.5">
                  <div className="text-xs font-semibold text-ink">Direct Sponsor Banner / Promotion</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="field-label" htmlFor="sponsor-title">
                        Sponsor Title
                      </label>
                      <input
                        id="sponsor-title"
                        type="text"
                        value={config.sponsorTitle || ''}
                        onChange={(e) => setConfig({ ...config, sponsorTitle: e.target.value })}
                        placeholder="e.g. Upgrade to Abyss Pro"
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="sponsor-link">
                        Target Click URL
                      </label>
                      <input
                        id="sponsor-link"
                        type="text"
                        value={config.sponsorLinkUrl || ''}
                        onChange={(e) => setConfig({ ...config, sponsorLinkUrl: e.target.value })}
                        placeholder="https://t.me/yourusername or promo link"
                        className="field"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="sponsor-desc">
                      Sponsor Description
                    </label>
                    <input
                      id="sponsor-desc"
                      type="text"
                      value={config.sponsorText || ''}
                      onChange={(e) => setConfig({ ...config, sponsorText: e.target.value })}
                      placeholder="Short promo text for the ad banner"
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="sponsor-banner-url">
                      Banner Image URL (Optional)
                    </label>
                    <input
                      id="sponsor-banner-url"
                      type="url"
                      value={config.sponsorBannerUrl || ''}
                      onChange={(e) => setConfig({ ...config, sponsorBannerUrl: e.target.value })}
                      placeholder="https://example.com/banner.png (Optional)"
                      className="field"
                    />
                    <p className="field-hint">If left empty, a sleek high-contrast card with title &amp; description is shown</p>
                  </div>
                </div>
              )}

              <div className="rounded-md bg-accent/10 border border-accent/20 p-2.5 text-xs text-ink-2 flex items-center justify-between">
                <span>Free Users: <strong>Ads Enabled</strong></span>
                <span>Pro / Premium Users: <strong className="text-emerald-400">100% Ad-Free</strong></span>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Mail size={15} style={{ color: 'var(--accent)' }} />
              <span>Automatic Active Notifications &amp; Email Dispatch</span>
            </span>
          }
          description="When users log in, AbyssGPT automatically greets them in-app and sends an email notification in English letting them know it is active and ready to assist them."
          action={
            <span className={`badge ${emailStatus?.configured ? 'badge-success' : 'badge-warning'}`}>
              {emailStatus?.configured ? 'SMTP Online' : 'Simulation Mode'}
            </span>
          }
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-2 p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">SMTP Status:</span>
                <span className={emailStatus?.configured ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                  {emailStatus?.configured ? 'Connected & Active' : 'Awaiting SMTP Env Config (Logging to Console)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-ink-3">
                <span>SMTP Host:</span>
                <span className="font-mono">{emailStatus?.host || 'Not configured'}</span>
              </div>
              <div className="flex items-center justify-between text-ink-3">
                <span>Sender From:</span>
                <span className="font-mono">{emailStatus?.from || 'Not configured'}</span>
              </div>
            </div>

            {testResult && (
              <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'}`} role="status">
                <Info className="h-4 w-4" />
                <span>{testResult.message}</span>
              </div>
            )}

            {broadcastResult && (
              <div className={`alert ${broadcastResult.success ? 'alert-success' : 'alert-error'}`} role="status">
                <Info className="h-4 w-4" />
                <span>{broadcastResult.message}</span>
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <label className="field-label" htmlFor="test-email-target">
                Send verification test email
              </label>
              <div className="flex gap-2">
                <input
                  id="test-email-target"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Enter email to test (e.g. user@example.com)"
                  className="field flex-1"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={sendingTest || !testEmail}
                  className="btn btn-secondary text-xs"
                >
                  {sendingTest ? <Spinner size={13} /> : <Send className="h-3.5 w-3.5" />}
                  <span>{sendingTest ? 'Sending…' : 'Send Test'}</span>
                </button>
              </div>
              <p className="field-hint">
                Verifies SMTP credentials and test delivery. When SMTP is not set, it simulates and logs.
              </p>
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-ink">Broadcast "I am active" to all users</div>
                <div className="text-xs text-ink-3">Sends an English active notification email to all registered user accounts.</div>
              </div>
              <button
                type="button"
                onClick={handleBroadcastActive}
                disabled={broadcasting}
                className="btn btn-secondary text-xs"
              >
                {broadcasting ? <Spinner size={13} /> : <Radio className="h-3.5 w-3.5 text-emerald-400" />}
                <span>{broadcasting ? 'Broadcasting…' : 'Broadcast Now'}</span>
              </button>
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
