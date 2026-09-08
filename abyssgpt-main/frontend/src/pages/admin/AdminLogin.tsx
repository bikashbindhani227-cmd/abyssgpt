import React, { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck, ArrowLeft } from 'lucide-react';
import { apiRequest, clearAdminToken, hasAdminToken, setAdminToken } from '../../lib/api.js';
import { AbyssLogo } from '../../components/AbyssLogo.js';
import { Spinner } from '../../components/ui.js';

interface AdminLoginProps {
  onAuthenticated: () => void;
  onBackToChat: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onAuthenticated, onBackToChat }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!hasAdminToken()) {
      setLoading(false);
      return;
    }
    apiRequest<{ authenticated: boolean }>('/api/admin/auth/status')
      .then(() => {
        if (active) onAuthenticated();
      })
      .catch(() => {
        clearAdminToken();
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onAuthenticated]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await apiRequest<{ token: string }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setAdminToken(data.token);
      setPassword('');
      onAuthenticated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Admin login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="splash">
        <Spinner size={20} className="text-ink-3" />
      </div>
    );
  }

  return (
    <div className="splash p-5">
      <div className="card w-full max-w-sm p-6 shadow-md sm:p-7">
        <div className="mb-7 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToChat}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-ink-3 transition-colors hover:text-ink"
            aria-label="Back to chat"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-line-strong bg-surface">
            <AbyssLogo size={22} />
          </div>
          <div className="w-9" />
        </div>

        <div className="mb-1 flex items-center justify-center gap-2">
          <ShieldCheck size={17} style={{ color: 'var(--accent)' }} />
          <h1 className="text-lg font-bold tracking-tight">AbyssGPT Admin</h1>
        </div>
        <p className="text-center text-xs text-ink-3">Enter the server-side admin password to continue.</p>

        <form onSubmit={login} className="mt-7 space-y-3">
          <div className="field-icon-wrap">
            <LockKeyhole className="h-4 w-4" size={16} />
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              autoComplete="current-password"
              className="field"
              aria-label="Admin password"
            />
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <button
            disabled={!password || submitting}
            className="btn btn-primary btn-block"
            style={{ height: 44 }}
          >
            {submitting && <Spinner size={15} />}
            <span>{submitting ? 'Signing in…' : 'Open Admin Panel'}</span>
          </button>
        </form>

        <p className="mt-5 text-center text-[10.5px] leading-5 text-ink-3">
          The password is never bundled into the frontend. It is verified only by the backend.
        </p>
      </div>
    </div>
  );
};
