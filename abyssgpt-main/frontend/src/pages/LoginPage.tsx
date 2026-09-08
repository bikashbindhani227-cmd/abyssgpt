import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { Mail, Lock, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { AbyssLogo } from '../components/AbyssLogo.js';
import { Spinner } from '../components/ui.js';

interface LoginPageProps {
  onNavigate: (page: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      onNavigate('chat');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      onNavigate('chat');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="splash p-4 sm:p-6">
      <div className="card w-full max-w-md p-7 sm:p-9 shadow-md">
        {/* Brand and title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-line-strong bg-surface shadow-sm">
            <AbyssLogo size={26} />
          </div>
          <h1 className="text-[22px] sm:text-2xl font-bold tracking-tight text-ink">Welcome back</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">Sign in to continue with AbyssGPT</p>
        </div>

        {error && (
          <div className="alert alert-error mb-5" role="alert">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Google sign-in */}
        <button
          id="btn-google-login"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="btn btn-soft btn-block mb-4"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="relative my-5" aria-hidden="true">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-line" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-surface px-3 text-xs text-ink-3">or continue with email</span>
          </div>
        </div>

        {/* Email & password */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="input-login-email">
              Email address
            </label>
            <div className="field-icon-wrap">
              <Mail className="h-4 w-4" />
              <input
                id="input-login-email"
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

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="field-label mb-0" htmlFor="input-login-password">
                Password
              </label>
              <button
                type="button"
                onClick={() => onNavigate('forgot-password')}
                className="text-xs font-medium text-ink-3 transition-colors hover:text-ink"
              >
                Forgot password?
              </button>
            </div>
            <div className="field-icon-wrap">
              <Lock className="h-4 w-4" />
              <input
                id="input-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="field"
              />
              <button
                type="button"
                className="field-trailing"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button id="btn-login-submit" type="submit" disabled={loading} className="btn btn-primary btn-block mt-1">
            {loading && <Spinner size={15} />}
            <span>{loading ? 'Signing in…' : 'Sign in'}</span>
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-ink-3">
          Don't have an account?{' '}
          <button
            id="link-go-to-register"
            onClick={() => onNavigate('register')}
            className="font-semibold text-ink hover:underline"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};
