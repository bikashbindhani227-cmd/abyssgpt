import React, { useState, useEffect } from 'react';
import { ArrowLeft, Crown, Check, Send, Zap, ShieldCheck, Clock, Gauge, Brain } from 'lucide-react';
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

/** Benefit rows are built from live backend limits when available so the
 *  page never contradicts the server's actual tier configuration. */
const staticBenefits = [
  { icon: Zap, key: 'queue', text: 'High-reasoning responses with a fast priority queue' },
  { icon: Brain, key: 'memory', text: 'Unlimited conversation history and long-term memory' },
];

export const PremiumPage: React.FC<PremiumPageProps> = ({ onBack }) => {
  const { userProfile } = useAuth();
  const [info, setInfo] = useState<PremiumInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<PremiumInfoResponse>('/api/user/premium')
      .then((data) => setInfo(data))
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load plan details'))
      .finally(() => setLoading(false));
  }, []);

  const priceInr = info?.priceInr;
  const telegramUsername = info?.telegramUsername || '@MrNewton_2';
  const cleanTelegram = telegramUsername.replace(/^@/, '');
  const telegramUrl = `https://t.me/${cleanTelegram}`;

  const isAlreadyPremium = userProfile?.plan === 'premium';
  const limitBenefits = info
    ? [
        { icon: Zap, key: 'daily', text: `${info.limits.dailyMessageLimit} daily messages` },
        { icon: Gauge, key: 'rate', text: `${info.limits.rateLimitPerMinute} requests per minute` },
        { icon: Clock, key: 'context', text: `${info.limits.contextLimit}-message context depth for deep reasoning` },
      ]
    : [];

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

      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
        {loading ? (
          <div className="card card-pad space-y-4">
            <Skeleton className="skeleton-title" />
            <Skeleton className="skeleton-text" style={{ width: '30%', height: 34 }} />
            <Skeleton className="skeleton-text" style={{ width: '88%' }} />
            <Skeleton className="skeleton-text" style={{ width: '72%' }} />
            <Skeleton className="skeleton-text" style={{ width: '80%' }} />
          </div>
        ) : (
          <article className="card card-pad relative overflow-hidden !p-6 sm:!p-9">
            {/* Restrained brand glow */}
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
              style={{ background: 'var(--accent-soft)' }}
              aria-hidden="true"
            />

            <div className="mb-6 flex items-center gap-3">
              <div
                className="grid h-12 w-12 place-items-center rounded-2xl border"
                style={{
                  background: 'var(--warning-soft)',
                  borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
                  color: 'var(--warning)',
                }}
              >
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">AbyssGPT Pro</h2>
                <p className="text-xs text-ink-3">Serious capacity for heavy, high-frequency use</p>
              </div>
            </div>

            {/* Pricing */}
            <div className="mb-6 flex items-baseline gap-2">
              {priceInr !== undefined ? (
                <>
                  <span className="tabular text-4xl font-bold tracking-tight">₹{priceInr}</span>
                  <span className="text-xs font-medium text-ink-3">/ month</span>
                </>
              ) : (
                <span className="text-sm text-ink-3">Contact us for current pricing</span>
              )}
            </div>

            {/* Active status */}
            {isAlreadyPremium && (
              <div
                className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-4 text-[13px] font-medium"
                style={{
                  background: 'var(--success-soft)',
                  borderColor: 'color-mix(in srgb, var(--success) 25%, transparent)',
                  color: 'var(--success)',
                }}
                role="status"
              >
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  <span>You have an active Pro membership</span>
                </span>
                {userProfile?.premiumExpiresAt && (
                  <span className="tabular text-[11px] text-ink-3">
                    Valid until{' '}
                    {new Date(userProfile.premiumExpiresAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Benefits */}
            <div className="mb-8">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
                Everything in Pro
              </h3>
              <ul className="space-y-2.5 text-[13.5px] text-ink-2">
                {limitBenefits.map(({ icon: Icon, key, text }) => (
                  <li key={key} className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
                    <span>{text}</span>
                  </li>
                ))}
                {staticBenefits.map(({ icon: Icon, key, text }) => (
                  <li key={key} className="flex items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
                    <span>{text}</span>
                  </li>
                ))}
                {info?.benefits?.filter(Boolean).map((b, i) => (
                  <li key={`custom-${i}`} className="flex items-start gap-2.5">
                    <Zap className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Activation flow (existing Telegram process) */}
            <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
              <div className="text-[13px] leading-relaxed text-ink-2">
                To activate or renew Pro, contact our admin on Telegram with your registered email address (
                <strong className="text-ink">{userProfile?.email}</strong>). Activation is applied promptly.
              </div>

              <a
                id="btn-telegram-contact"
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-block"
                style={{
                  background: 'linear-gradient(135deg, var(--warning), color-mix(in srgb, var(--warning) 78%, #000))',
                  color: '#191920',
                  height: 44,
                  fontSize: 13.5,
                }}
              >
                <Send className="h-4 w-4" />
                <span>Contact {telegramUsername} on Telegram</span>
              </a>

              <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-3">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Access is verified and provisioned manually for security.</span>
              </p>
            </div>

            {loadError && !info && (
              <p className="mt-4 text-center text-xs text-ink-3">
                Showing default contact details — some plan information could not be loaded.
              </p>
            )}
          </article>
        )}
      </main>
    </div>
  );
};
