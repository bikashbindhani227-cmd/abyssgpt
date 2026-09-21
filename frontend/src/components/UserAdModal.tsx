import React, { useState, useEffect } from 'react';
import {
  X,
  Megaphone,
  Sparkles,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  PlusCircle,
  RefreshCw,
  Send,
  MessageSquare,
  Globe,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { apiRequest } from '../lib/api.js';
import type { UserAdSubmission } from '../types.js';

interface UserAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'create' | 'list';
}

export const UserAdModal: React.FC<UserAdModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'create',
}) => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'create' | 'list'>(defaultTab);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [contactInfo, setContactInfo] = useState(
    userProfile?.email ? `${userProfile.email}` : ''
  );
  const [durationDays, setDurationDays] = useState<number>(7);
  const [notes, setNotes] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // History state
  const [submissions, setSubmissions] = useState<UserAdSubmission[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const fetchMyAds = async () => {
    setLoadingList(true);
    try {
      const res = await apiRequest<{ ads: UserAdSubmission[] }>('/api/user/ads');
      setSubmissions(res.ads || []);
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMyAds();
      setSubmitError(null);
      setSubmitSuccess(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setSubmitError('Please enter an ad title or brand name.');
      return;
    }
    if (!linkUrl.trim()) {
      setSubmitError('Please enter a destination link or website URL.');
      return;
    }
    if (!contactInfo.trim()) {
      setSubmitError('Please provide your Telegram handle, WhatsApp, or email for coordination.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await apiRequest<{ success: boolean; ad: UserAdSubmission; message: string }>(
        '/api/user/ads',
        {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            linkUrl: linkUrl.trim(),
            bannerUrl: bannerUrl.trim() || undefined,
            contactInfo: contactInfo.trim(),
            durationDays,
            notes: notes.trim() || undefined,
          }),
        }
      );

      setSubmitSuccess(
        res.message || 'Ad campaign submitted! Our team will contact you to activate it.'
      );
      // Reset form
      setTitle('');
      setDescription('');
      setLinkUrl('');
      setBannerUrl('');
      setNotes('');
      // Refresh list
      fetchMyAds();
      // Switch to list tab after 1.8s
      setTimeout(() => {
        setActiveTab('list');
      }, 1800);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit ad request.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: UserAdSubmission['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live & Active
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <CheckCircle2 size={12} />
            Approved (Queued)
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle size={12} />
            Declined
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock size={12} />
            Pending Review
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col text-ink">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
              <Megaphone size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Advertise on AbyssGPT</h2>
              <p className="text-xs text-ink-3">
                Place your sponsor ad directly on our platform
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-3 hover:text-ink rounded-lg hover:bg-surface-3 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-line px-5 pt-2 bg-surface-2/30 shrink-0">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-px ${
              activeTab === 'create'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            <PlusCircle size={14} />
            Submit New Ad
          </button>
          <button
            onClick={() => {
              setActiveTab('list');
              fetchMyAds();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-px ${
              activeTab === 'list'
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            <Eye size={14} />
            My Ads & Campaigns
            {submissions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-accent/20 text-accent font-bold">
                {submissions.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'create' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Promo Pitch Banner */}
              <div className="p-3.5 rounded-xl border border-accent/20 bg-accent/5 flex items-start gap-3 text-xs">
                <Sparkles size={16} className="text-accent shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-ink">
                    Direct Visibility to 1,000+ Active AI Developers & Users
                  </span>
                  <p className="text-ink-3 leading-relaxed">
                    Your ad or sponsored banner will appear across the left sidebar and initial chat
                    screen on AbyssGPT. Ideal for Telegram channels, SaaS tools, apps, and dev communities.
                  </p>
                </div>
              </div>

              {submitSuccess && (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>{submitSuccess}</span>
                </div>
              )}

              {submitError && (
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Title & Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Ad Headline / Product Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NextGen Cloud Host"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-accent outline-none text-ink placeholder:text-ink-4 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Destination URL (Link) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Globe size={13} className="absolute left-3 top-2.5 text-ink-3" />
                    <input
                      type="url"
                      required
                      placeholder="https://t.me/channel or https://yoursite.com"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-accent outline-none text-ink placeholder:text-ink-4 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Short Pitch / Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Deploy your applications worldwide in seconds with zero configuration. Get $50 free credit today!"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-accent outline-none text-ink placeholder:text-ink-4 transition resize-none"
                />
              </div>

              {/* Banner Image URL */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Banner Image URL <span className="text-ink-3 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <ImageIcon size={13} className="absolute left-3 top-2.5 text-ink-3" />
                  <input
                    type="url"
                    placeholder="https://yoursite.com/banner.png"
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-accent outline-none text-ink placeholder:text-ink-4 transition"
                  />
                </div>
                <span className="text-[11px] text-ink-3 mt-1 block">
                  Leave empty for a clean text + icon sponsor card, or enter an image link.
                </span>
              </div>

              {/* Contact Info & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Contact Handle / Email <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <MessageSquare size={13} className="absolute left-3 top-2.5 text-ink-3" />
                    <input
                      type="text"
                      required
                      placeholder="Telegram @handle, WhatsApp, or email"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-accent outline-none text-ink placeholder:text-ink-4 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Campaign Duration
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { days: 7, label: '7 Days', price: '₹499' },
                      { days: 15, label: '15 Days', price: '₹899' },
                      { days: 30, label: '30 Days', price: '₹1,499' },
                    ].map((d) => (
                      <button
                        key={d.days}
                        type="button"
                        onClick={() => setDurationDays(d.days)}
                        className={`p-1.5 rounded-lg border text-center text-xs transition ${
                          durationDays === d.days
                            ? 'border-accent bg-accent/10 text-accent font-semibold'
                            : 'border-line bg-surface-2 text-ink hover:border-ink-3'
                        }`}
                      >
                        <div>{d.label}</div>
                        <div className="text-[10px] text-ink-3">{d.price}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Special Notes / Request <span className="text-ink-3 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Any target date, specific instructions or budget flexibility..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-accent outline-none text-ink placeholder:text-ink-4 transition"
                />
              </div>

              {/* Live Preview Box */}
              <div className="pt-2">
                <div className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
                  <Eye size={13} className="text-accent" />
                  Live Preview in AbyssGPT Ad Slot:
                </div>
                <div className="p-3 rounded-xl border border-dashed border-line bg-surface-2/40">
                  <div className="ad-container" style={{ margin: 0 }}>
                    <div className="ad-header">
                      <span className="ad-badge">Sponsor / Ad</span>
                      <span className="text-[10px] text-accent">Preview</span>
                    </div>
                    {bannerUrl.trim() ? (
                      <div className="ad-banner-img-wrap">
                        <img
                          src={bannerUrl.trim()}
                          alt={title || 'Sponsor banner'}
                          className="ad-banner-img max-h-24"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="ad-banner-placeholder">
                        <div className="ad-icon-box">
                          <Sparkles size={16} className="ad-icon" />
                        </div>
                        <div className="ad-text-box">
                          <strong className="ad-title">
                            {title.trim() || 'Your Brand or Service Title'}
                          </strong>
                          <span className="ad-desc">
                            {description.trim() ||
                              'Your engaging description will appear right here to all AbyssGPT users.'}
                          </span>
                        </div>
                        <ExternalLink size={14} className="ad-arrow" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs text-ink-3 hover:text-ink transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary btn-sm flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      Submit Ad Request
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Submissions List Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-3">
                  Track the approval and live status of your ads:
                </span>
                <button
                  onClick={fetchMyAds}
                  disabled={loadingList}
                  className="text-xs flex items-center gap-1.5 text-accent hover:underline"
                >
                  <RefreshCw size={12} className={loadingList ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {loadingList ? (
                <div className="py-10 text-center text-xs text-ink-3">
                  <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-2" />
                  Loading your ad campaigns...
                </div>
              ) : submissions.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink-3 space-y-3">
                  <Megaphone size={28} className="mx-auto text-ink-4 opacity-60" />
                  <div>
                    <p className="font-semibold text-ink text-sm">No ad requests submitted yet</p>
                    <p className="text-ink-3 mt-0.5">
                      Ready to promote your project? Submit your first ad campaign in seconds.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                  >
                    <PlusCircle size={13} />
                    Submit an Ad
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {submissions.map((ad) => (
                    <div
                      key={ad.id}
                      className="p-4 rounded-xl border border-line bg-surface-2/70 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-ink">{ad.title}</h4>
                          <a
                            href={ad.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-0.5"
                          >
                            <span className="truncate max-w-[240px]">{ad.linkUrl}</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                        <div>{getStatusBadge(ad.status)}</div>
                      </div>

                      {ad.description && (
                        <p className="text-xs text-ink-2 bg-surface-3/50 p-2 rounded-lg">
                          {ad.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3 pt-1 border-t border-line/60">
                        <span>Duration: {ad.durationDays} Days</span>
                        <span>Contact: {ad.contactInfo}</span>
                        <span>
                          Submitted: {new Date(ad.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {ad.adminNote && (
                        <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20 text-xs">
                          <span className="font-semibold text-accent">Admin Update: </span>
                          <span className="text-ink-2">{ad.adminNote}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
