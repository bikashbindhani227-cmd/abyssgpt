import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

export interface SourceEntry {
  title?: string;
  url: string;
  text?: string;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    const m = url.match(/^(?:https?:\/\/)?([^/]+)/);
    return m ? m[1] : url;
  }
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

export interface SourcesDialogProps {
  open: boolean;
  sources: SourceEntry[];
  onClose: () => void;
}

/**
 * Modal dialog listing all sources gathered by an agent web_search call.
 * Inspired by Hacker AI's SourcesDialog.tsx — adapted to AbyssGPT's
 * simpler source shape (title + url + optional snippet).
 */
export const SourcesDialog: React.FC<SourcesDialogProps> = ({ open, sources, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const items = useMemo(() => sources.slice(0, 50), [sources]);
  if (!open) return null;

  return (
    <div className="sources-dialog-overlay" onClick={onClose}>
      <div className="sources-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Citations">
        <div className="sources-dialog-header">
          <span>Citations ({items.length})</span>
          <button type="button" className="sources-dialog-close" onClick={onClose} aria-label="Close citations dialog">
            <X size={15} />
          </button>
        </div>
        <div className="sources-dialog-list">
          {items.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-3)', fontSize: '13px', textAlign: 'center' }}>
              No citations were gathered for this response.
            </div>
          ) : (
            items.map((src, idx) => {
              const domain = getDomain(src.url);
              return (
                <a key={`${src.url}-${idx}`} className="sources-dialog-item" href={src.url} target="_blank" rel="noopener noreferrer">
                  <span className="sources-dialog-host">
                    <img
                      className="sources-dialog-favicon"
                      src={faviconUrl(domain)}
                      alt=""
                      width={14}
                      height={14}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                    {domain}
                  </span>
                  <span className="sources-dialog-title">{src.title || src.url}</span>
                  {src.text && <span className="sources-dialog-text">{src.text}</span>}
                </a>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
