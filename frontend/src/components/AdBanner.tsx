import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, ExternalLink, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { apiRequest } from '../lib/api.js';
import type { AppSettingsConfig } from '../types.js';

interface AdBannerProps {
  slot: 'sidebar' | 'chat-empty';
  onOpenPremium?: () => void;
}

let cachedSettings: AppSettingsConfig | null = null;
let fetchPromise: Promise<AppSettingsConfig> | null = null;

function loadPublicSettings(): Promise<AppSettingsConfig> {
  if (cachedSettings) return Promise.resolve(cachedSettings);
  if (!fetchPromise) {
    fetchPromise = apiRequest<AppSettingsConfig>('/api/settings')
      .then((s) => {
        cachedSettings = s;
        return s;
      })
      .catch(() => ({
        appName: 'AbyssGPT',
        welcomeMessage: '',
        maintenanceMode: false,
        registrationEnabled: true,
        maxMessageLength: 4000,
        premiumPriceInr: 299,
        telegramUsername: '@MrNewton_2',
        premiumBenefits: [],
        defaultPremiumDurationDays: 30,
        adsEnabled: true,
        adsProvider: 'banner' as const,
        sponsorLinkUrl: 'https://telegram.me/MrNewton_2',
        sponsorTitle: 'AbyssGPT Pro',
        sponsorText: 'Unlock 200 daily messages and remove all ads!',
      }));
  }
  return fetchPromise;
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

export const AdBanner: React.FC<AdBannerProps> = ({ slot, onOpenPremium }) => {
  const { userProfile } = useAuth();
  const [settings, setSettings] = useState<AppSettingsConfig | null>(cachedSettings);
  const adsenseRef = useRef<HTMLModElement>(null);
  const customScriptRef = useRef<HTMLDivElement>(null);

  const isPremium = userProfile?.plan === 'premium';

  useEffect(() => {
    loadPublicSettings().then((s) => setSettings(s));
  }, []);

  // Pro users never see ads
  if (isPremium) {
    return null;
  }

  // If ads are disabled in settings, hide
  if (settings && !settings.adsEnabled) {
    return null;
  }

  const provider = settings?.adsProvider || 'banner';
  const clientId = settings?.adsenseClientId?.trim() || '';
  const slotId = settings?.adsenseSlotId?.trim() || '';
  const customScript = settings?.customAdScript?.trim() || '';

  // Google AdSense loader
  useEffect(() => {
    if (provider === 'adsense' && clientId) {
      const scriptId = 'google-adsense-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }

      try {
        if (typeof window !== 'undefined') {
          window.adsbygoogle = window.adsbygoogle || [];
          window.adsbygoogle.push({});
        }
      } catch {
        // Ignored if adblocker is active
      }
    }
  }, [provider, clientId, slotId]);

  // Custom Script loader
  useEffect(() => {
    if (provider === 'custom' && customScript && customScriptRef.current) {
      customScriptRef.current.innerHTML = customScript;
      // Execute inline script tags if any
      const scripts = customScriptRef.current.querySelectorAll('script');
      scripts.forEach((oldScript) => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });
    }
  }, [provider, customScript]);

  // 1. Google AdSense slot
  if (provider === 'adsense' && clientId) {
    return (
      <div className={`ad-container ad-slot-${slot}`} role="complementary" aria-label="Advertisement">
        <div className="ad-header">
          <span className="ad-badge">Advertisement</span>
          {onOpenPremium && (
            <button type="button" className="ad-hide-btn" onClick={onOpenPremium}>
              Hide ads with Pro
            </button>
          )}
        </div>
        <div className="ad-content-wrap">
          <ins
            ref={adsenseRef}
            className="adsbygoogle"
            style={{ display: 'block', textAlign: 'center' }}
            data-ad-client={clientId}
            data-ad-slot={slotId || undefined}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      </div>
    );
  }

  // 2. Custom Script slot (Monetag / Adsterra / etc.)
  if (provider === 'custom' && customScript) {
    return (
      <div className={`ad-container ad-slot-${slot}`} role="complementary" aria-label="Advertisement">
        <div className="ad-header">
          <span className="ad-badge">Sponsored</span>
          {onOpenPremium && (
            <button type="button" className="ad-hide-btn" onClick={onOpenPremium}>
              Hide ads with Pro
            </button>
          )}
        </div>
        <div ref={customScriptRef} className="ad-custom-script" />
      </div>
    );
  }

  // 3. Default Sponsor / Banner card (Live immediately, clicks go to sponsor URL or Pro Upgrade)
  const title = settings?.sponsorTitle || 'Upgrade to Abyss Pro';
  const text = settings?.sponsorText || 'Get 200 daily messages, priority reasoning & 100% ad-free experience.';
  const linkUrl = settings?.sponsorLinkUrl || 'https://telegram.me/MrNewton_2';
  const bannerImg = settings?.sponsorBannerUrl?.trim() || '';

  return (
    <div className={`ad-container ad-slot-${slot}`} role="complementary" aria-label="Sponsored Partner">
      <div className="ad-header">
        <span className="ad-badge">Sponsor / Ad</span>
        {onOpenPremium && (
          <button type="button" className="ad-hide-btn" onClick={onOpenPremium}>
            Remove Ads
          </button>
        )}
      </div>

      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ad-card-link"
        onClick={(e) => {
          if (linkUrl.startsWith('#') || linkUrl.includes('pro') || linkUrl.includes('upgrade')) {
            if (onOpenPremium) {
              e.preventDefault();
              onOpenPremium();
            }
          }
        }}
      >
        {bannerImg ? (
          <div className="ad-banner-img-wrap">
            <img src={bannerImg} alt={title} className="ad-banner-img" />
          </div>
        ) : (
          <div className="ad-banner-placeholder">
            <div className="ad-icon-box">
              <Sparkles size={16} className="ad-icon" />
            </div>
            <div className="ad-text-box">
              <strong className="ad-title">{title}</strong>
              <span className="ad-desc">{text}</span>
            </div>
            <ExternalLink size={14} className="ad-arrow" />
          </div>
        )}
      </a>
    </div>
  );
};
