import React, { useState, useEffect } from 'react';
import { ArrowLeft, Crown, Check, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { apiRequest } from '../lib/api.js';
import { Skeleton } from '../components/ui.js';

interface PremiumPageProps {
  onBack: () => void;
}

interface PremiumInfoResponse {
  currentPlan: 'free' | 'premium';
  premiumExpiresAt?: string | null;
  priceInr: number;
  telegramUsername: string;
  benefits: string[];
  limits: {
    dailyMessageLimit: number;
    rateLimitPerMinute: number;
    contextLimit: number;
  };
}

/**
 * Default Telegram contact shown when the backend hasn't returned a configured
 * username. Mirrors the backend default in configService.ts
 * (process.env.TELEGRAM_USERNAME || '@MrNewton_2').
 *
 * SECURITY: this is the ONLY admin contact surface exposed to the user. No
 * email address, password, API key, or Firebase credential is ever shown here.
 */
const DEFAULT_TELEGRAM_USERNAME = '@MrNewton_2';

export const PremiumPage: React.FC<PremiumPageProps> = ({ onBack }) => {
  const { userProfile, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<PremiumInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<PremiumInfoResponse>('/api/user/premium')
      .then((data) => setInfo(data))
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load plan details'))
      .finally(() => setLoading(false));
  }, []);

  const pageLoading = loading || authLoading;

  // Telegram username — server-configured value with a safe fallback.
  const telegramUsername = info?.telegramUsername || DEFAULT_TELEGRAM_USERNAME;
  const cleanTelegram = telegramUsername.replace(/^@/, '');
  const telegramUrl = `https://t.me/${cleanTelegram}`;

  const isAlreadyPremium = userProfile?.plan === 'premium';

  // Single source of truth for the feature list: the backend-configured
  // premiumBenefits array. This prevents the duplicate-list bug where the
  // page rendered three separate lists (limitBenefits + staticBenefits +
  // info.benefits) all describing the same 5 features with different wording.
  //
  // When the backend hasn't returned benefits yet, fall back to a clean
  // minimal list that matches the default configured on the server.
  const benefits: string[] =
    info?.benefits && info.benefits.length > 0
      ? info.benefits.filter(Boolean)
      : [
          `${info?.limits.dailyMessageLimit ?? 200} messages per day`,
          `${info?.limits.rateLimitPerMinute ?? 30} requests per minute`,
          `${info?.limits.contextLimit ?? 30}-message context window`,
          'Priority access',
          'Unlimited conversation history',
        ];

  const priceInr = info?.priceInr ?? 299;

  return (
    <div className="min-h-dvh bg-bg text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
          <button
            id="btn-premium-back"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to chat</span>
          </button>
          <h1 className="text-[15px] font-bold">Premium</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {pageLoading ? (
          <div className="card card-pad space-y-4">
            <Skeleton className="skeleton-title" />
            <Skeleton className="skeleton-text" style={{ width: '30%', height: 34 }} />
            <Skeleton className="skeleton-text" style={{ width: '88%' }} />
            <Skeleton className="skeleton-text" style={{ width: '72%' }} />
          </div>
        ) : (
          <article className="card card-pad !p-5 sm:!p-7">
            {/* Plan identity + price — compact header */}
            <div className="mb-5 flex items-center gap-3">
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border"
                style={{
                  background: 'var(--warning-soft)',
                  borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
                  color: 'var(--warning)',
                }}
              >
                <Crown className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold tracking-tight sm:text-lg">AbyssGPT Pro</h2>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="tabular text-2xl font-extrabold tracking-tight sm:text-3xl">₹{priceInr}</span>
                  <span className="text-[11px] font-medium text-ink-3">/ month</span>
                </div>
              </div>
            </div>

            {/* Active status — only shown when user already has Pro */}
            {isAlreadyPremium && (
              <div
                className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-[12.5px] font-medium"
                style={{
                  background: 'var(--success-soft)',
                  borderColor: 'color-mix(in srgb, var(--success) 25%, transparent)',
                  color: 'var(--success)',
                }}
                role="status"
              >
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  <span>Active Pro membership</span>
                </span>
                {userProfile?.premiumExpiresAt && (
                  <span className="tabular text-[11px] text-ink-3">
                    Until{' '}
                    {new Date(userProfile.premiumExpiresAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Feature list — single source of truth, each feature appears ONCE */}
            <ul className="mb-6 space-y-2.5 text-[13.5px] text-ink-2">
              {benefits.map((benefit, i) => (
                <li key={`benefit-${i}`} className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: 'var(--success)' }}
                    aria-hidden="true"
                  />
                  <span className="leading-snug">{benefit}</span>
                </li>
              ))}
            </ul>

            {/* Clean Telegram contact section — no email, no marketing filler */}
            <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
              <div>
                <p className="text-[13px] font-semibold text-ink">Need Pro?</p>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  Contact admin on Telegram to activate.
                </p>
              </div>

              <div
                className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2.5"
                aria-label={`Telegram admin contact: ${telegramUsername}`}
              >
                <Send className="h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                <span className="font-mono text-[13px] font-semibold text-ink select-all">{telegramUsername}</span>
              </div>

              <a
                id="btn-telegram-contact"
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-block"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 78%, #000))',
                  color: 'var(--accent-ink)',
                  height: 44,
                  fontSize: 13.5,
                }}
              >
                <Send className="h-4 w-4" />
                <span>Contact on Telegram</span>
              </a>
            </div>

            {loadError && !info && (
              <p className="mt-4 text-center text-[11px] text-ink-3">
                Showing default contact details — some plan information could not be loaded.
              </p>
            )}
          </article>
        )}
      </main>
    </div>
  );
};
