import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  User,
  Moon,
  Sun,
  Laptop,
  Brain,
  Trash2,
  Check,
  Crown,
  Clock,
  Gauge,
  Sparkles,
  ShieldCheck,
  Shield,
  EyeOff,
  Megaphone,
  PlusCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { apiRequest } from '../lib/api.js';
import { SectionCard, Spinner, Toggle } from '../components/ui.js';
import { UserAdModal } from '../components/UserAdModal.js';
import type { UserMemory, UserAdSubmission } from '../types.js';

interface SettingsPageProps {
  onBack: () => void;
  onOpenPremium: () => void;
}

type SettingsTab = 'profile' | 'appearance' | 'memory' | 'plan' | 'advertise';

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'profile', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Moon },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'plan', label: 'Plan & Limits', icon: Gauge },
  { id: 'advertise', label: 'Advertise with Us', icon: Megaphone },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, onOpenPremium }) => {
  const { userProfile, limits, updateDisplayName, updateAdsToggle } = useAuth();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Ad toggle state for Premium members
  const [isSavingAds, setIsSavingAds] = useState(false);
  const [adsToggleSaved, setAdsToggleSaved] = useState(false);
  const [adsToggleError, setAdsToggleError] = useState<string | null>(null);

  // Memory state
  const [memory, setMemory] = useState<UserMemory>({ facts: [], enabled: true, updatedAt: '' });
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  // Advertise tab state
  const [showAdModal, setShowAdModal] = useState(false);
  const [userAds, setUserAds] = useState<UserAdSubmission[]>([]);
  const [loadingUserAds, setLoadingUserAds] = useState(false);

  useEffect(() => {
    if (activeTab === 'memory') {
      loadMemory();
    } else if (activeTab === 'advertise') {
      loadUserAds();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadUserAds = async () => {
    setLoadingUserAds(true);
    try {
      const res = await apiRequest<{ ads: UserAdSubmission[] }>('/api/user/ads');
      setUserAds(res.ads || []);
    } catch {
      // ignore
    } finally {
      setLoadingUserAds(false);
    }
  };

  const loadMemory = async () => {
    setLoadingMemory(true);
    setMemoryError(null);
    try {
      const data = await apiRequest<UserMemory>('/api/memory');
      setMemory(data);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Could not load your memory profile.');
    } finally {
      setLoadingMemory(false);
    }
  };

  const handleToggleMemory = async () => {
    try {
      const updated = await apiRequest<UserMemory>('/api/memory', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !memory.enabled }),
      });
      setMemory(updated);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Could not update memory setting.');
    }
  };

  const handleDeleteFact = async (index: number) => {
    try {
      const updated = await apiRequest<UserMemory>(`/api/memory/${index}`, {
        method: 'DELETE',
      });
      setMemory(updated);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Could not delete this memory.');
    }
  };

  const handleClearAllMemory = async () => {
    if (!confirm('Are you sure you want to clear all conversational memory facts?')) return;
    try {
      const updated = await apiRequest<UserMemory>('/api/memory/all', {
        method: 'DELETE',
      });
      setMemory(updated);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Could not clear memory.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setNameError('Display name cannot be empty.');
      return;
    }
    setNameError(null);
    setIsSavingName(true);
    try {
      await updateDisplayName(displayName.trim());
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setIsSavingName(false);
    }
  };

  const themeOptions: Array<{ id: 'dark' | 'light' | 'system'; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'system', label: 'System', icon: Laptop },
  ];

  const isPremium = userProfile?.plan === 'premium' || Boolean(userProfile?.isAdmin);
  // Default for premium members is ad-free (true) unless explicitly toggled to false
  const adsToggledOff = isPremium ? userProfile?.hideAds !== false : false;

  const handleToggleAds = async (newVal: boolean) => {
    if (!isPremium) {
      onOpenPremium();
      return;
    }
    setAdsToggleError(null);
    setIsSavingAds(true);
    try {
      await updateAdsToggle(newVal);
      setAdsToggleSaved(true);
      setTimeout(() => setAdsToggleSaved(false), 2200);
    } catch (err) {
      setAdsToggleError(err instanceof Error ? err.message : 'Could not update ad preferences.');
    } finally {
      setIsSavingAds(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <button
            id="btn-settings-back"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to chat</span>
          </button>
          <h1 className="text-[15px] font-bold">Settings</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        {/* Section tabs */}
        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" aria-label="Settings sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
                activeTab === id ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Account */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <SectionCard title="Account details" description="How your name appears across AbyssGPT.">
              <form onSubmit={handleSaveProfile} className="max-w-md space-y-4">
                <div>
                  <label className="field-label" htmlFor="settings-display-name">
                    Display name
                  </label>
                  <input
                    id="settings-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="field"
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="settings-email">
                    Email
                  </label>
                  <input id="settings-email" type="text" value={userProfile?.email || ''} disabled className="field" />
                </div>

                <div>
                  <label className="field-label" htmlFor="settings-uid">
                    User ID
                  </label>
                  <input
                    id="settings-uid"
                    type="text"
                    value={userProfile?.uid || ''}
                    disabled
                    className="field font-mono text-xs"
                  />
                </div>

                {nameError && (
                  <div className="alert alert-error" role="alert">
                    <span>{nameError}</span>
                  </div>
                )}

                <div className="pt-1">
                  <button type="submit" disabled={isSavingName} className="btn btn-primary">
                    {isSavingName && <Spinner size={14} />}
                    {!isSavingName && nameSaved && <Check className="h-4 w-4" />}
                    <span>{nameSaved ? 'Saved' : isSavingName ? 'Saving…' : 'Save changes'}</span>
                  </button>
                </div>
              </form>
            </SectionCard>

            {/* Ad-Free Experience SectionCard */}
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
                  <span>Ad-Free Experience</span>
                </span>
              }
              description={
                isPremium
                  ? 'Toggle off all advertisements and sponsored banners across the platform.'
                  : 'Ad-free experience is reserved exclusively for AbyssGPT Pro members.'
              }
              action={
                isPremium ? (
                  <div className="flex items-center gap-2">
                    {isSavingAds && <Spinner size={14} />}
                    {!isSavingAds && adsToggleSaved && <Check className="h-4 w-4 text-emerald-400" />}
                    <Toggle
                      checked={adsToggledOff}
                      onChange={handleToggleAds}
                      label={adsToggledOff ? 'Turn off all advertisements: ON' : 'Turn off all advertisements: OFF'}
                    />
                  </div>
                ) : (
                  <span className="badge badge-warning flex items-center gap-1">
                    <Crown size={11} /> Pro only
                  </span>
                )
              }
            >
              {adsToggleError && (
                <div className="alert alert-error mb-3" role="alert">
                  <span>{adsToggleError}</span>
                </div>
              )}

              {isPremium ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 p-3.5 text-xs">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          adsToggledOff ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-3 text-ink-3'
                        }`}
                      >
                        {adsToggledOff ? <EyeOff size={16} /> : <Shield size={16} />}
                      </div>
                      <div>
                        <div className="font-semibold text-ink">
                          {adsToggledOff ? 'All advertisements are turned off' : 'Advertisements are currently visible'}
                        </div>
                        <div className="text-[11.5px] text-ink-3">
                          {adsToggledOff
                            ? 'Zero advertisements or promotional banners will appear anywhere on your screen.'
                            : 'Flip the switch above to toggle off all banner and display ads.'}
                        </div>
                      </div>
                    </div>
                    <span className={`badge text-[11px] ${adsToggledOff ? 'badge-success' : 'badge-neutral'}`}>
                      {adsToggledOff ? '100% Ad-Free' : 'Ads Active'}
                    </span>
                  </div>
                  <p className="field-hint">
                    As a Premium member, this switch gives you complete control over advertisements on your account.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="font-semibold text-ink">Enjoy a completely ad-free platform</div>
                    <div className="text-ink-3">
                      Upgrade to AbyssGPT Pro to unlock the ad-free switch, 200 daily messages, and priority reasoning.
                    </div>
                  </div>
                  <button onClick={onOpenPremium} className="btn btn-sm btn-primary shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Upgrade to Pro</span>
                  </button>
                </div>
              )}
            </SectionCard>

            {!isPremium && (
              <SectionCard title="AbyssGPT Pro" description="Higher limits, longer memory, priority processing.">
                <button onClick={onOpenPremium} className="btn btn-primary">
                  <Sparkles className="h-4 w-4" />
                  <span>See Pro benefits</span>
                </button>
              </SectionCard>
            )}
          </div>
        )}

        {/* Appearance */}
        {activeTab === 'appearance' && (
          <SectionCard title="Appearance" description="Choose how AbyssGPT looks on this device.">
            <div className="grid max-w-md grid-cols-3 gap-3 pt-1">
              {themeOptions.map(({ id, label, icon: Icon }) => {
                const active = theme === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTheme(id)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                      active
                        ? 'border-accent bg-accent-soft text-accent-strong'
                        : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink-2'
                    }`}
                  >
                    <Icon size={19} />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
            <p className="field-hint">System follows your device's light or dark preference automatically.</p>
          </SectionCard>
        )}

        {/* Memory */}
        {activeTab === 'memory' && (
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <Brain size={15} style={{ color: 'var(--accent)' }} />
                <span>Long-term memory</span>
              </span>
            }
            description="Lets the assistant recall key facts and preferences across your conversations."
            action={
              <Toggle
                checked={memory.enabled}
                onChange={handleToggleMemory}
                label={memory.enabled ? 'Disable long-term memory' : 'Enable long-term memory'}
              />
            }
          >
            {memoryError && (
              <div className="alert alert-error" role="alert">
                <span>{memoryError}</span>
              </div>
            )}

            {loadingMemory ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-ink-3">
                <Spinner size={14} />
                <span>Loading memory profile…</span>
              </div>
            ) : memory.facts.length === 0 ? (
              <p className="py-6 text-center text-[13px] leading-relaxed text-ink-3">
                No memories recorded yet. As you chat, key preferences and facts will be noted here to make
                future conversations more personal.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-2">Stored facts ({memory.facts.length})</span>
                  <button
                    onClick={handleClearAllMemory}
                    className="flex items-center gap-1 text-xs font-semibold transition-colors"
                    style={{ color: 'var(--error)' }}
                  >
                    <Trash2 className="h-3 w-3" /> Clear all
                  </button>
                </div>

                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {memory.facts.map((fact, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink"
                    >
                      <span className="flex-1">{fact}</span>
                      <button
                        onClick={() => handleDeleteFact(index)}
                        title="Delete this memory"
                        aria-label={`Delete memory: ${fact}`}
                        className="p-1 text-ink-3 transition-colors hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
        )}

        {/* Plan & Limits */}
        {activeTab === 'plan' && (
          <SectionCard
            title="Plan & usage"
            description="Limits below are enforced by the server for your account."
            action={
              isPremium ? (
                <span className="badge badge-warning">
                  <Crown size={11} /> Pro
                </span>
              ) : (
                <button onClick={onOpenPremium} className="btn btn-sm btn-primary">
                  Upgrade
                </button>
              )
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
                  <Clock className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                  Daily messages
                </div>
                <div className="tabular mt-1.5 text-xl font-bold text-ink">
                  {userProfile?.dailyMessageCount ?? 0} / {limits?.dailyLimit ?? 3}
                </div>
                <div className="mt-0.5 text-[10.5px] text-ink-3">Resets daily at 00:00 UTC</div>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
                  <Gauge className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                  Rate limit
                </div>
                <div className="tabular mt-1.5 text-xl font-bold text-ink">{limits?.rateLimit ?? 5} / min</div>
                <div className="mt-0.5 text-[10.5px] text-ink-3">Requests per minute window</div>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
                  <Brain className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                  Context depth
                </div>
                <div className="tabular mt-1.5 text-xl font-bold text-ink">{limits?.contextLimit ?? 10} msgs</div>
                <div className="mt-0.5 text-[10.5px] text-ink-3">Conversation history retained</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
                  <div>
                    <div className="text-xs font-semibold text-ink">Ad-Free Platform Browsing</div>
                    <div className="text-[11.5px] text-ink-3">
                      {isPremium
                        ? adsToggledOff
                          ? '100% ad-free experience is active across the platform.'
                          : 'Advertisements are currently turned on.'
                        : 'Free plan displays sponsored banners. Upgrade to Pro to turn off all ads.'}
                    </div>
                  </div>
                </div>
                {isPremium ? (
                  <div className="flex items-center gap-2">
                    {isSavingAds && <Spinner size={13} />}
                    <Toggle
                      checked={adsToggledOff}
                      onChange={handleToggleAds}
                      label="Toggle ads off"
                    />
                  </div>
                ) : (
                  <button onClick={onOpenPremium} className="btn btn-xs btn-primary shrink-0">
                    Remove ads
                  </button>
                )}
              </div>
            </div>

            {isPremium && userProfile?.premiumExpiresAt && (
              <p className="text-xs text-ink-3">
                Pro renews:{' '}
                {new Date(userProfile.premiumExpiresAt).toLocaleDateString([], {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}
          </SectionCard>
        )}

        {/* Advertise with Us Tab */}
        {activeTab === 'advertise' && (
          <SectionCard className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                  <Megaphone size={18} style={{ color: 'var(--accent)' }} />
                  Self-Serve Advertising & Sponsorships
                </h3>
                <p className="text-xs text-ink-3 mt-1">
                  Promote your brand, SaaS app, YouTube channel, or Telegram community to active AI builders on AbyssGPT.
                </p>
              </div>

              <button
                onClick={() => setShowAdModal(true)}
                className="btn btn-primary btn-sm flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-sm"
              >
                <PlusCircle size={14} />
                Submit New Ad
              </button>
            </div>

            {/* Value highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-line bg-surface-2 space-y-1">
                <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                  Targeted Visibility
                </div>
                <p className="text-[11.5px] text-ink-3">
                  Prominent placement in the left sidebar and initial chat screen.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-line bg-surface-2 space-y-1">
                <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Clock size={13} style={{ color: 'var(--accent)' }} />
                  Flexible Durations
                </div>
                <p className="text-[11.5px] text-ink-3">
                  Choose from 7-day, 15-day, or 30-day continuous featured placements.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-line bg-surface-2 space-y-1">
                <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Check size={13} style={{ color: 'var(--accent)' }} />
                  Live Preview & Direct Links
                </div>
                <p className="text-[11.5px] text-ink-3">
                  Clickable banners routed straight to your website, Telegram, or channel.
                </p>
              </div>
            </div>

            {/* User's Campaigns List */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                  Your Submitted Campaigns ({userAds.length})
                </h4>
                <button
                  onClick={loadUserAds}
                  disabled={loadingUserAds}
                  className="text-xs flex items-center gap-1 text-ink-3 hover:text-ink transition"
                >
                  <RefreshCw size={12} className={loadingUserAds ? 'animate-spin' : ''} />
                  Refresh Status
                </button>
              </div>

              {loadingUserAds ? (
                <div className="py-8 text-center text-xs text-ink-3">
                  <Spinner size={18} className="mx-auto mb-2" />
                  Loading your ad campaigns...
                </div>
              ) : userAds.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-line bg-surface-2/40 space-y-3">
                  <Megaphone size={28} className="mx-auto text-ink-4 opacity-50" />
                  <div>
                    <div className="text-xs font-semibold text-ink">No active or submitted ads</div>
                    <div className="text-[11.5px] text-ink-3 mt-0.5">
                      You haven't submitted any ad campaigns yet. Click below to place your first ad!
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAdModal(true)}
                    className="btn btn-soft btn-sm inline-flex items-center gap-1.5 text-xs"
                  >
                    <PlusCircle size={13} />
                    Submit Ad Now
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {userAds.map((ad) => (
                    <div
                      key={ad.id}
                      className="p-4 rounded-xl border border-line bg-surface-2/70 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-ink">{ad.title}</div>
                          <a
                            href={ad.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-0.5"
                          >
                            <span className="truncate max-w-[260px]">{ad.linkUrl}</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                        <div>
                          {ad.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active Live
                            </span>
                          ) : ad.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                              Approved
                            </span>
                          ) : ad.status === 'rejected' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              Declined
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              Pending Review
                            </span>
                          )}
                        </div>
                      </div>

                      {ad.description && (
                        <p className="text-xs text-ink-2 bg-surface-3/50 p-2.5 rounded-lg leading-relaxed">
                          {ad.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3 pt-1 border-t border-line/60">
                        <span>Duration: {ad.durationDays} Days</span>
                        <span>Contact: {ad.contactInfo}</span>
                        <span>Submitted: {new Date(ad.createdAt).toLocaleDateString()}</span>
                      </div>

                      {ad.adminNote && (
                        <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20 text-xs">
                          <span className="font-semibold text-accent">Admin Response: </span>
                          <span className="text-ink-2">{ad.adminNote}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        )}
      </main>

      <UserAdModal isOpen={showAdModal} onClose={() => { setShowAdModal(false); loadUserAds(); }} />
    </div>
  );
};
