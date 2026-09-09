import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { AbyssLogo } from '../components/AbyssLogo.js';
import { Spinner } from '../components/ui.js';

interface ForgotPasswordPageProps {
  onNavigate: (page: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="splash p-4 sm:p-6">
      <div className="card w-full max-w-md p-7 sm:p-9 shadow-md">
        <button
          onClick={() => onNavigate('login')}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to sign in</span>
        </button>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line-strong bg-surface shadow-sm">
            <AbyssLogo size={26} />
          </div>
          <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight text-ink">Reset password</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">Enter your email to receive a password reset link</p>
        </div>

        {error && (
          <div className="alert alert-error mb-5" role="alert">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="space-y-4 rounded-2xl border p-5" style={{ background: 'var(--success-soft)', borderColor: 'color-mix(in srgb, var(--success) 25%, transparent)' }}>
            <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--success)' }}>
              <CheckCircle2 className="h-4 w-4" />
              <span>Email sent</span>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-2">
              If an account exists for <strong className="text-ink">{email}</strong>, you will receive an email
              with instructions to reset your password.
            </p>
            <button onClick={() => onNavigate('login')} className="btn btn-soft btn-block">
              Return to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="input-forgot-email">
                Email address
              </label>
              <div className="field-icon-wrap">
                <Mail className="h-4 w-4" />
                <input
                  id="input-forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="field"
                />
              </div>
            </div>

            <button id="btn-forgot-submit" type="submit" disabled={loading} className="btn btn-primary btn-block mt-1">
              {loading && <Spinner size={15} />}
              <span>{loading ? 'Sending link…' : 'Send reset link'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
