import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Trash2,
  Sparkles,
  RefreshCw,
  Send,
  MessageSquare,
  Radio,
  Eye,
  Check,
} from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { SectionCard, Spinner } from '../../components/ui.js';
import type { UserAdSubmission, AdSubmissionStatus } from '../../types.js';

export const AdminAds: React.FC = () => {
  const [ads, setAds] = useState<UserAdSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AdSubmissionStatus>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const loadAds = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ ads: UserAdSubmission[] }>('/api/admin/ads');
      setAds(res.ads || []);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load user ad requests',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAds();
  }, []);

  const handleUpdateStatus = async (
    id: string,
    status: AdSubmissionStatus,
    setAsLiveSponsor = false
  ) => {
    setActionLoadingId(id);
    setFeedback(null);
    try {
      const adminNote = editingNotes[id];
      const res = await apiRequest<{ success: boolean; ad: UserAdSubmission }>(
        `/api/admin/ads/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            adminNote,
            setAsLiveSponsor,
          }),
        }
      );
      if (res.ad) {
        setAds((prev) => prev.map((a) => (a.id === id ? res.ad : a)));
      }
      setFeedback({
        type: 'success',
        text: setAsLiveSponsor
          ? 'Ad activated as the LIVE sponsor banner on AbyssGPT!'
          : `Ad status updated to "${status}".`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update ad',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this ad request?')) return;
    setActionLoadingId(id);
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/ads/${id}`, { method: 'DELETE' });
      setAds((prev) => prev.filter((a) => a.id !== id));
      setFeedback({ type: 'success', text: 'Ad request deleted.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete ad',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredAds = filter === 'all' ? ads : ads.filter((a) => a.status === filter);

  const counts = {
    all: ads.length,
    pending: ads.filter((a) => a.status === 'pending').length,
    approved: ads.filter((a) => a.status === 'approved').length,
    active: ads.filter((a) => a.status === 'active').length,
    rejected: ads.filter((a) => a.status === 'rejected').length,
  };

  const getStatusBadge = (status: AdSubmissionStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active on Platform
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <CheckCircle2 size={12} />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle size={12} />
            Declined
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock size={12} />
            Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
            <Megaphone className="text-accent" size={22} />
            User Ad Submissions & Sponsorships
          </h1>
          <p className="text-xs sm:text-sm text-ink-3 mt-1">
            Review user-submitted ads, coordinate campaigns, and activate them directly as live sponsor banners.
          </p>
        </div>

        <button
          onClick={loadAds}
          disabled={loading}
          className="btn btn-soft btn-sm self-start sm:self-auto flex items-center gap-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-line bg-surface">
          <div className="text-[11px] font-semibold text-ink-3">Total Requests</div>
          <div className="text-xl font-bold text-ink mt-0.5">{counts.all}</div>
        </div>
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="text-[11px] font-semibold text-amber-400">Pending Review</div>
          <div className="text-xl font-bold text-amber-400 mt-0.5">{counts.pending}</div>
        </div>
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="text-[11px] font-semibold text-emerald-400">Live Active Ads</div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">{counts.active}</div>
        </div>
        <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5">
          <div className="text-[11px] font-semibold text-blue-400">Approved (Queued)</div>
          <div className="text-xl font-bold text-blue-400 mt-0.5">{counts.approved}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-line pb-3">
        {[
          { key: 'all' as const, label: `All (${counts.all})` },
          { key: 'pending' as const, label: `Pending (${counts.pending})` },
          { key: 'approved' as const, label: `Approved (${counts.approved})` },
          { key: 'active' as const, label: `Active (${counts.active})` },
          { key: 'rejected' as const, label: `Declined (${counts.rejected})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === tab.key
                ? 'bg-accent text-white shadow-sm'
                : 'bg-surface-2 text-ink-3 hover:text-ink hover:bg-surface-3'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ad List */}
      {loading ? (
        <div className="py-16 text-center text-xs text-ink-3">
          <Spinner size={24} className="mx-auto mb-2" />
          Loading ad submissions...
        </div>
      ) : filteredAds.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-line bg-surface-2/40 text-ink-3 text-xs space-y-2">
          <Megaphone size={32} className="mx-auto text-ink-4 opacity-50" />
          <p className="font-semibold text-ink text-sm">No ad requests in this view</p>
          <p>When users submit ads from their profile or sidebar banner, they will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAds.map((ad) => {
            const isLoading = actionLoadingId === ad.id;
            const currentNote =
              editingNotes[ad.id] !== undefined ? editingNotes[ad.id] : ad.adminNote || '';

            return (
              <SectionCard key={ad.id} className="p-4 sm:p-5 space-y-4">
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-line pb-3.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-ink">{ad.title}</h3>
                      {getStatusBadge(ad.status)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                      <span>
                        By: <strong className="text-ink">{ad.userDisplayName}</strong> ({ad.userEmail})
                      </span>
                      <span>
                        Contact:{' '}
                        <strong className="text-accent underline cursor-pointer select-all">
                          {ad.contactInfo}
                        </strong>
                      </span>
                      <span>Duration: {ad.durationDays} Days</span>
                      <span>Submitted: {new Date(ad.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start">
                    <a
                      href={ad.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-soft btn-xs flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} />
                      Test URL
                    </a>
                    <button
                      onClick={() => handleDelete(ad.id)}
                      disabled={isLoading}
                      className="btn btn-ghost btn-xs text-rose-400 hover:text-rose-300"
                      title="Delete ad request"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Content & Banner Preview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">
                        Pitch / Description
                      </span>
                      <p className="text-ink-2 bg-surface-2 p-3 rounded-xl leading-relaxed border border-line">
                        {ad.description || 'No description provided.'}
                      </p>
                    </div>

                    {ad.notes && (
                      <div>
                        <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">
                          User Notes / Request
                        </span>
                        <p className="text-ink-3 bg-surface-3 p-2.5 rounded-lg italic">
                          "{ad.notes}"
                        </p>
                      </div>
                    )}

                    {/* Admin Note Input */}
                    <div>
                      <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">
                        Admin Note / Response (Visible to User)
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Approved! Campaign runs Sept 25 to Oct 2."
                          value={currentNote}
                          onChange={(e) =>
                            setEditingNotes({ ...editingNotes, [ad.id]: e.target.value })
                          }
                          className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-ink placeholder:text-ink-4 outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => handleUpdateStatus(ad.id, ad.status)}
                          disabled={isLoading}
                          className="btn btn-soft btn-xs shrink-0"
                        >
                          Save Note
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Ad visual card preview */}
                  <div>
                    <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider block mb-1 flex items-center gap-1">
                      <Eye size={12} /> Live Card Preview
                    </span>
                    <div className="ad-container" style={{ margin: 0 }}>
                      <div className="ad-header">
                        <span className="ad-badge">Sponsor / Ad</span>
                        <span className="text-[10px] text-accent">Live Preview</span>
                      </div>
                      {ad.bannerUrl ? (
                        <div className="ad-banner-img-wrap">
                          <img
                            src={ad.bannerUrl}
                            alt={ad.title}
                            className="ad-banner-img max-h-20"
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
                            <strong className="ad-title">{ad.title}</strong>
                            <span className="ad-desc">{ad.description}</span>
                          </div>
                          <ExternalLink size={14} className="ad-arrow" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-line">
                  <div className="text-[11px] text-ink-3">
                    Status Actions for this Ad:
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {ad.status !== 'active' && (
                      <button
                        onClick={() => handleUpdateStatus(ad.id, 'active', true)}
                        disabled={isLoading}
                        className="btn btn-primary btn-xs flex items-center gap-1.5 shadow-sm"
                        title="Set this ad as the live sponsor banner on AbyssGPT immediately"
                      >
                        {isLoading ? <Spinner size={12} /> : <Sparkles size={12} />}
                        <span>Set as Live Sponsor Banner</span>
                      </button>
                    )}

                    {ad.status !== 'approved' && (
                      <button
                        onClick={() => handleUpdateStatus(ad.id, 'approved', false)}
                        disabled={isLoading}
                        className="btn btn-soft btn-xs flex items-center gap-1.5"
                      >
                        <Check size={12} />
                        Approve (Queue)
                      </button>
                    )}

                    {ad.status !== 'pending' && (
                      <button
                        onClick={() => handleUpdateStatus(ad.id, 'pending', false)}
                        disabled={isLoading}
                        className="btn btn-soft btn-xs"
                      >
                        Set Pending
                      </button>
                    )}

                    {ad.status !== 'rejected' && (
                      <button
                        onClick={() => handleUpdateStatus(ad.id, 'rejected', false)}
                        disabled={isLoading}
                        className="btn btn-soft btn-xs text-rose-400 hover:text-rose-300"
                      >
                        Decline
                      </button>
                    )}
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
