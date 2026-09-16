import React, { useMemo, useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  Bookmark,
  Clipboard,
  ExternalLink,
  AlertTriangle,
  Search,
  Code2,
  Terminal,
  BookOpen,
  Sparkles,
  Layers,
} from 'lucide-react';
import { SourcesDialog, type SourceEntry } from './SourcesDialog.js';

export interface AgentSource {
  title: string;
  url: string;
}

export interface AgentActivityItem {
  id: string;
  tool: 'search' | 'read' | 'code' | 'think' | 'verify' | 'tool';
  title: string;
  detail?: string;
  status: 'running' | 'done' | 'error';
  sources?: AgentSource[];
  startedAt: number;
  completedAt?: number;
}

export interface AgentActivityProps {
  items?: AgentActivityItem[];
  compact?: boolean;
  isStreaming?: boolean;
  startedAt?: number | null;
  finishedAt?: number | null;
  thinkingText?: string | null;
  userPrompt?: string;
  onToast?: (msg: string) => void;
}

interface StepItem {
  id: string;
  title: string;
  status: 'done' | 'running' | 'error' | 'pending';
  duration?: string;
  parsedIntent?: string;
  meta?: Record<string, string>;
  toolExecuted?: string;
  codePreview?: string;
  warning?: string;
  detailText?: string;
  sources?: AgentSource[];
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0.4s';
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export const AgentActivity: React.FC<AgentActivityProps> = ({
  items = [],
  isStreaming = false,
  startedAt,
  finishedAt,
  thinkingText,
  userPrompt,
  onToast,
}) => {
  // Collapsed by default once finished, open by default while streaming/planning
  const [panelOpen, setPanelOpen] = useState(true);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set(['step-1']));
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Live timer while streaming
  useEffect(() => {
    if (!isStreaming) return;
    const start = startedAt || Date.now();
    const tick = () => setElapsedMs(Math.max(0, Date.now() - start));
    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [isStreaming, startedAt]);

  const totalDuration = useMemo(() => {
    if (startedAt && finishedAt && finishedAt >= startedAt) {
      return formatDuration(finishedAt - startedAt);
    }
    if (elapsedMs > 0) {
      return formatDuration(elapsedMs);
    }
    return '0.4s';
  }, [startedAt, finishedAt, elapsedMs]);

  // Extract all sources for dialog
  const allSources = useMemo<SourceEntry[]>(() => {
    const list: SourceEntry[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.sources) continue;
      for (const src of item.sources) {
        if (!src.url || seen.has(src.url)) continue;
        seen.add(src.url);
        list.push({ title: src.title, url: src.url });
      }
    }
    return list;
  }, [items]);

  // Extract a clean intent summary from user prompt if available
  const intentSummary = useMemo(() => {
    if (!userPrompt || !userPrompt.trim()) return 'Analyze query and fulfill prompt constraints';
    const firstLine = userPrompt.trim().split('\n')[0].slice(0, 75);
    return firstLine.length === 75 ? `${firstLine}…` : firstLine;
  }, [userPrompt]);

  // Build the unified timeline steps inspired by the reference video
  const steps = useMemo<StepItem[]>(() => {
    const list: StepItem[] = [];

    // If backend emitted real tool items, transform them
    if (items.length > 0) {
      items.forEach((item, idx) => {
        let toolName = 'agent_tool';
        if (item.tool === 'search') toolName = 'web_search';
        else if (item.tool === 'read') toolName = 'read_url';
        else if (item.tool === 'code') toolName = 'run_code';
        else if (item.tool === 'verify') toolName = 'code_verify';

        const durationStr = item.completedAt && item.startedAt
          ? formatDuration(item.completedAt - item.startedAt)
          : isStreaming && item.status === 'running'
            ? formatDuration(Date.now() - item.startedAt)
            : '0.4s';

        list.push({
          id: item.id || `tool-step-${idx}`,
          title: item.title,
          status: item.status === 'done' ? 'done' : item.status === 'error' ? 'error' : 'running',
          duration: durationStr,
          toolExecuted: toolName,
          detailText: item.detail,
          sources: item.sources,
        });
      });
      return list;
    }

    // If an active thinking status is provided from the backend without separate tool steps
    if (thinkingText) {
      list.push({
        id: 'thinking-step',
        title: thinkingText,
        status: isStreaming ? 'running' : 'done',
        duration: formatDuration(elapsedMs),
      });
      return list;
    }

    return list;
  }, [items, isStreaming, elapsedMs, thinkingText]);

  const toggleStep = (stepId: string) => {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleCopyPlan = async () => {
    const textLines = steps.map((s) => {
      let line = `[${s.status.toUpperCase()}] ${s.title} (${s.duration || '0.4s'})`;
      if (s.parsedIntent) line += `\n  Intent: ${s.parsedIntent}`;
      if (s.toolExecuted) line += `\n  Tool: ${s.toolExecuted}`;
      if (s.detailText) line += `\n  Detail: ${s.detailText}`;
      if (s.warning) line += `\n  Warning: ${s.warning}`;
      return line;
    }).join('\n\n');

    try {
      await navigator.clipboard.writeText(textLines);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      onToast?.('Activity plan copied');
    } catch {
      onToast?.('Clipboard unavailable');
    }
  };

  const handleBookmark = () => {
    setBookmarked((b) => !b);
    onToast?.(bookmarked ? 'Bookmark removed' : 'Plan bookmarked');
  };

  const isPlanningActive = isStreaming && (!finishedAt || finishedAt === null);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="agent-planning-card" data-open={panelOpen ? 'true' : 'false'}>
      {/* Overarching Card Header */}
      <div
        className="agent-planning-header"
        onClick={() => setPanelOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={panelOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPanelOpen((v) => !v);
          }
        }}
      >
        <div className="agent-planning-header-left">
          {isPlanningActive ? (
            <div className="agent-spinning-arc" aria-hidden="true" />
          ) : (
            <div className="agent-check-circle" aria-hidden="true">
              <Check size={12} strokeWidth={3} />
            </div>
          )}
          <div className="agent-planning-title-group">
            <span className="agent-planning-main-title">
              {isPlanningActive ? (thinkingText || 'Agent is planning') : 'Agent plan & execution'}
            </span>
          </div>
        </div>

        <div className="agent-planning-header-right">
          <span className="agent-planning-duration-badge">{totalDuration}</span>
          <ChevronDown
            size={16}
            className={`agent-planning-chevron ${panelOpen ? 'open' : ''}`}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Accordion Body */}
      {panelOpen && (
        <div className="agent-planning-body">
          <div className="agent-steps-list">
            {steps.map((step) => {
              const isExpanded = expandedStepIds.has(step.id);

              return (
                <div
                  key={step.id}
                  className={`agent-step-row ${step.status} ${isExpanded ? 'expanded' : ''}`}
                >
                  <div
                    className="agent-step-header"
                    onClick={() => toggleStep(step.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleStep(step.id);
                      }
                    }}
                  >
                    <div className="agent-step-icon-wrap" aria-hidden="true">
                      {step.status === 'done' && (
                        <div className="step-icon-done">
                          <Check size={11} strokeWidth={2.8} />
                        </div>
                      )}
                      {step.status === 'running' && (
                        <div className="step-icon-running" />
                      )}
                      {step.status === 'error' && (
                        <div className="step-icon-error">
                          <AlertTriangle size={11} />
                        </div>
                      )}
                      {step.status === 'pending' && (
                        <div className="step-icon-pending" />
                      )}
                    </div>

                    <span className="agent-step-title">{step.title}</span>

                    <div className="agent-step-meta">
                      {step.duration && (
                        <span className="agent-step-duration">{step.duration}</span>
                      )}
                      <ChevronRight
                        size={13}
                        className={`agent-step-chevron ${isExpanded ? 'rotated' : ''}`}
                        aria-hidden="true"
                      />
                    </div>
                  </div>

                  {/* Expandable Step Detail Content */}
                  {isExpanded && (
                    <div className="agent-step-detail-container">
                      {/* Parsed User Intent */}
                      {step.parsedIntent && (
                        <div className="agent-step-intent">
                          <div className="intent-title-row">
                            <Check size={13} className="text-emerald-400" />
                            <span>Parsed user intent:</span>
                          </div>
                          <p className="intent-text">{step.parsedIntent}</p>
                        </div>
                      )}

                      {/* Key-Value Metadata */}
                      {step.meta && (
                        <div className="agent-step-meta-grid">
                          {Object.entries(step.meta).map(([key, val]) => (
                            <div key={key} className="meta-row">
                              <span className="meta-key">{key}:</span>
                              <span className="meta-val">{val}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Tool Execution Tag */}
                      {step.toolExecuted && (
                        <div className="agent-step-tool-tag">
                          <Terminal size={12} className="tool-icon" />
                          <span>Executing tool:</span>
                          <code className="tool-name">{step.toolExecuted}</code>
                        </div>
                      )}

                      {/* Text Detail or Tool Results */}
                      {step.detailText && (
                        <div className="agent-step-detail-text">
                          <pre>{step.detailText}</pre>
                        </div>
                      )}

                      {/* Code Block Preview */}
                      {step.codePreview && (
                        <div className="agent-step-code-preview">
                          <div className="code-preview-head">
                            <Code2 size={12} />
                            <span>Logic synthesis</span>
                          </div>
                          <pre>
                            <code>{step.codePreview}</code>
                          </pre>
                        </div>
                      )}

                      {/* Warning Callout */}
                      {step.warning && (
                        <div className="agent-step-warning-box">
                          <AlertTriangle size={14} className="warning-icon" />
                          <div className="warning-content">
                            <strong className="warning-label">Optimization &amp; Constraint Check:</strong>
                            <p className="warning-text">{step.warning}</p>
                          </div>
                        </div>
                      )}

                      {/* Citations/Sources links */}
                      {step.sources && step.sources.length > 0 && (
                        <div className="agent-step-sources">
                          <div className="sources-label">
                            <BookOpen size={12} />
                            <span>Retrieved sources:</span>
                          </div>
                          <div className="sources-list">
                            {step.sources.map((src, sIdx) => (
                              <a
                                key={`${src.url}-${sIdx}`}
                                href={src.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="source-item-link"
                              >
                                <span>{src.title || src.url}</span>
                                <ExternalLink size={10} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Card Footer Actions (Bookmark / Copy / Citations) */}
          <div className="agent-planning-footer">
            <div className="footer-actions-left">
              <button
                type="button"
                className={`footer-btn ${bookmarked ? 'active' : ''}`}
                onClick={handleBookmark}
                title={bookmarked ? 'Saved to bookmarks' : 'Bookmark plan'}
                aria-label="Bookmark plan"
              >
                <Bookmark size={13} fill={bookmarked ? 'currentColor' : 'none'} />
                <span>{bookmarked ? 'Bookmarked' : 'Bookmark'}</span>
              </button>

              <button
                type="button"
                className="footer-btn"
                onClick={handleCopyPlan}
                title="Copy plan details"
                aria-label="Copy plan"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Clipboard size={13} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {allSources.length > 0 && (
              <button
                type="button"
                className="footer-sources-btn"
                onClick={() => setSourcesDialogOpen(true)}
              >
                <ExternalLink size={12} />
                <span>{allSources.length} source{allSources.length === 1 ? '' : 's'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      <SourcesDialog
        open={sourcesDialogOpen}
        sources={allSources}
        onClose={() => setSourcesDialogOpen(false)}
      />
    </div>
  );
};
