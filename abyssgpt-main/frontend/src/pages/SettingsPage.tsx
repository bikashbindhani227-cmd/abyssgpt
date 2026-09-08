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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { apiRequest } from '../lib/api.js';
import { SectionCard, Spinner, Toggle } from '../components/ui.js';
import type { UserMemory } from '../types.js';

interface SettingsPageProps {
  onBack: () => void;
  onOpenPremium: () => void;
}

type SettingsTab = 'profile' | 'appearance' | 'memory' | 'plan';

const TABS: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'profile', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Moon },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'plan', label: 'Plan & Limits', icon: Gauge },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack, onOpenPremium }) => {
  const { userProfile, limits, updateDisplayName } = useAuth();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Memory state
  const [memory, setMemory] = useState<UserMemory>({ facts: [], enabled: true, updatedAt: '' });
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'memory') {
      loadMemory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  const isPremium = userProfile?.plan === 'premium';

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
                  {userProfile?.dailyMessageCount ?? 0} / {limits?.dailyLimit ?? 20}
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
      </main>
    </div>
  );
};
