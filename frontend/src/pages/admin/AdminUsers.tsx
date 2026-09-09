import React, { useState, useEffect, useCallback } from 'react';
import { Search, Crown, Ban, RotateCcw, Sliders, AlertCircle, X } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { Modal, Skeleton, Spinner } from '../../components/ui.js';
import type { UserProfile } from '../../types.js';

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Modal states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [premiumDuration, setPremiumDuration] = useState(30);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [grantingPremium, setGrantingPremium] = useState(false);

  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [customDailyLimit, setCustomDailyLimit] = useState<string>('');
  const [customRateLimit, setCustomRateLimit] = useState<string>('');
  const [savingLimits, setSavingLimits] = useState(false);

  const fetchUsers = useCallback((q: string = '') => {
    setLoading(true);
    apiRequest<UserProfile[]>(`/api/admin/users?q=${encodeURIComponent(q)}`)
      .then((data) => {
        setUsers(data);
        setActionError(null);
      })
      .catch((err) => setActionError(err instanceof Error ? err.message : 'Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(search);
  };

  const handleGrantPremium = async () => {
    if (!selectedUser || grantingPremium) return;
    setGrantingPremium(true);
    try {
      const updated = await apiRequest<UserProfile>(`/api/admin/users/${selectedUser.uid}/premium`, {
        method: 'POST',
        body: JSON.stringify({ durationDays: premiumDuration }),
      });
      setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
      setShowPremiumModal(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to grant premium');
    } finally {
      setGrantingPremium(false);
    }
  };

  const handleRemovePremium = async (uid: string) => {
    if (!confirm('Remove premium access for this user?')) return;
    setBusyUserId(uid);
    try {
      const updated = await apiRequest<UserProfile>(`/api/admin/users/${uid}/premium`, {
        method: 'DELETE',
      });
      setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove premium');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleToggleBan = async (uid: string, currentlyBanned: boolean) => {
    const action = currentlyBanned ? 'unban' : 'ban';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    setBusyUserId(uid);
    try {
      const updated = await apiRequest<UserProfile>(`/api/admin/users/${uid}/${action}`, {
        method: 'POST',
      });
      setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action} user`);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetUsage = async (uid: string) => {
    setBusyUserId(uid);
    try {
      const updated = await apiRequest<UserProfile>(`/api/admin/users/${uid}/reset-usage`, {
        method: 'POST',
      });
      setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to reset daily count');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveCustomLimits = async () => {
    if (!selectedUser || savingLimits) return;
    setSavingLimits(true);
    try {
      const d = customDailyLimit === '' ? null : Number(customDailyLimit);
      const r = customRateLimit === '' ? null : Number(customRateLimit);
      const updated = await apiRequest<UserProfile>(`/api/admin/users/${selectedUser.uid}`, {
        method: 'PATCH',
        body: JSON.stringify({
          customDailyMessageLimit: d,
          customRateLimitPerMinute: r,
        }),
      });
      setUsers((prev) => prev.map((u) => (u.uid === updated.uid ? updated : u)));
      setShowLimitsModal(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update custom limits');
    } finally {
      setSavingLimits(false);
    }
  };

  const openLimitsModal = (user: UserProfile) => {
    setSelectedUser(user);
    setCustomDailyLimit(user.customDailyMessageLimit ? String(user.customDailyMessageLimit) : '');
    setCustomRateLimit(user.customRateLimitPerMinute ? String(user.customRateLimitPerMinute) : '');
    setShowLimitsModal(true);
  };

  const busy = (uid: string) => busyUserId === uid;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">User Management</h2>
          <p className="mt-0.5 text-xs text-ink-3">Manage plans, individual quotas, bans, and usage</p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="field-icon-wrap" style={{ minWidth: 210 }}>
            <Search className="h-3.5 w-3.5" size={14} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, name, UID…"
              aria-label="Search users"
              className="field"
              style={{ height: 36, fontSize: 12.5 }}
            />
          </div>
          <button type="submit" className="btn btn-soft" style={{ height: 36, fontSize: 12.5 }}>
            Search
          </button>
        </form>
      </div>

      {actionError && (
        <div className="alert alert-error" role="alert">
          <AlertCircle className="h-4 w-4" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss error" className="p-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              <tr className="bg-surface-2">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Today</th>
                <th className="px-4 py-3 font-semibold">Custom limits</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="skeleton-text" style={{ marginBottom: 0 }} />
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[13px] text-ink-3">
                    No users found matching your query.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.uid} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        <span className="max-w-[180px] truncate">{user.displayName || 'Unnamed User'}</span>
                        {user.isAdmin && <span className="badge badge-accent">Admin</span>}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-ink-2">{user.email}</div>
                      <div className="max-w-[220px] truncate font-mono text-[10px] text-ink-3">{user.uid}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`badge ${user.plan === 'premium' ? 'badge-warning' : 'badge-neutral'}`}>
                        {user.plan === 'premium' && <Crown className="h-2.5 w-2.5" />}
                        <span>{user.plan}</span>
                      </span>
                      {user.premiumExpiresAt && (
                        <div className="tabular mt-1 text-[10px] text-ink-3">
                          Exp {new Date(user.premiumExpiresAt).toLocaleDateString()}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`badge ${user.isBanned ? 'badge-danger' : 'badge-success'}`}>
                        {user.isBanned ? 'Banned' : 'Active'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="tabular font-semibold text-ink">{user.dailyMessageCount}</div>
                      <button
                        onClick={() => handleResetUsage(user.uid)}
                        disabled={busy(user.uid)}
                        title="Reset daily usage to 0"
                        className="mt-0.5 flex items-center gap-0.5 text-[10.5px] font-medium text-ink-3 transition-colors hover:text-accent-strong disabled:opacity-50"
                      >
                        {busy(user.uid) ? <Spinner size={10} /> : <RotateCcw className="h-2.5 w-2.5" />} Reset
                      </button>
                    </td>

                    <td className="px-4 py-3">
                      {user.customDailyMessageLimit || user.customRateLimitPerMinute ? (
                        <div className="tabular font-mono text-[11px]" style={{ color: 'var(--accent-strong)' }}>
                          {user.customDailyMessageLimit ? `${user.customDailyMessageLimit}/day` : 'default'}
                          {' · '}
                          {user.customRateLimitPerMinute ? `${user.customRateLimitPerMinute}/min` : 'default'}
                        </div>
                      ) : (
                        <span className="text-[11px] text-ink-3">Plan defaults</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {user.plan === 'premium' ? (
                          <button
                            onClick={() => handleRemovePremium(user.uid)}
                            disabled={busy(user.uid)}
                            title="Remove Premium"
                            aria-label={`Remove premium from ${user.email}`}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 transition-colors hover:bg-surface-3 disabled:opacity-50"
                            style={{ color: 'var(--warning)' }}
                          >
                            <Crown className="h-3.5 w-3.5 fill-current" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setPremiumDuration(30);
                              setShowPremiumModal(true);
                            }}
                            disabled={busy(user.uid)}
                            title="Grant Premium"
                            aria-label={`Grant premium to ${user.email}`}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3 disabled:opacity-50"
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => openLimitsModal(user)}
                          title="Configure custom limits"
                          aria-label={`Configure limits for ${user.email}`}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleBan(user.uid, user.isBanned)}
                          disabled={busy(user.uid)}
                          title={user.isBanned ? 'Unban user' : 'Ban user'}
                          aria-label={`${user.isBanned ? 'Unban' : 'Ban'} ${user.email}`}
                          className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors disabled:opacity-50 ${
                            user.isBanned
                              ? 'border-line bg-surface-2 text-ink-2 hover:bg-surface-3'
                              : 'border-line bg-surface-2 text-ink-2 hover:bg-surface-3'
                          }`}
                          style={user.isBanned ? { color: 'var(--success)' } : undefined}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grant premium modal */}
      {selectedUser && (
        <Modal
          open={showPremiumModal}
          onClose={() => setShowPremiumModal(false)}
          title={
            <span>
              <Crown className="mr-1 inline h-4 w-4" style={{ color: 'var(--warning)' }} />
              Grant Premium Access
            </span>
          }
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setShowPremiumModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleGrantPremium} disabled={grantingPremium}>
                {grantingPremium && <Spinner size={14} />}
                <span>{grantingPremium ? 'Activating…' : 'Activate Premium'}</span>
              </button>
            </>
          }
        >
          <p className="mb-4">
            Grant premium benefits to <strong className="text-ink">{selectedUser.email}</strong>.
          </p>
          <div>
            <label className="field-label" htmlFor="premium-duration">
              Duration
            </label>
            <select
              id="premium-duration"
              value={premiumDuration}
              onChange={(e) => setPremiumDuration(Number(e.target.value))}
              className="field"
            >
              <option value={7}>7 days (1 week)</option>
              <option value={30}>30 days (1 month)</option>
              <option value={90}>90 days (3 months)</option>
              <option value={365}>365 days (1 year)</option>
            </select>
          </div>
        </Modal>
      )}

      {/* Custom limits modal */}
      {selectedUser && (
        <Modal
          open={showLimitsModal}
          onClose={() => setShowLimitsModal(false)}
          title={
            <span>
              <Sliders className="mr-1 inline h-4 w-4" style={{ color: 'var(--accent)' }} />
              Per-User Limit Override
            </span>
          }
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setShowLimitsModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveCustomLimits} disabled={savingLimits}>
                {savingLimits && <Spinner size={14} />}
                <span>{savingLimits ? 'Saving…' : 'Save Limits'}</span>
              </button>
            </>
          }
        >
          <p className="mb-4">
            Set custom limits for <strong className="text-ink">{selectedUser.email}</strong>. Leave a field empty
            to use the plan default.
          </p>
          <div className="space-y-3">
            <div>
              <label className="field-label" htmlFor="custom-daily">
                Custom daily message limit
              </label>
              <input
                id="custom-daily"
                type="number"
                min={1}
                value={customDailyLimit}
                onChange={(e) => setCustomDailyLimit(e.target.value)}
                placeholder="e.g. 50"
                className="field"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="custom-rate">
                Custom rate limit (per minute)
              </label>
              <input
                id="custom-rate"
                type="number"
                min={1}
                value={customRateLimit}
                onChange={(e) => setCustomRateLimit(e.target.value)}
                placeholder="e.g. 15"
                className="field"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
