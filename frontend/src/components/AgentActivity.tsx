import React, { useMemo, useState } from 'react';
import { ChevronDown, CheckCircle2, Circle, Search, BookOpen, Code2, Sparkles, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { ToolBlock } from './ToolBlock.js';
import { AgentWorkHeader } from './AgentWorkHeader.js';
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

function toolNameFor(item: AgentActivityItem): string {
  switch (item.tool) {
    case 'search': return 'web_search';
    case 'read': return 'read_url';
    case 'code': return 'run_code';
    default: return '';
  }
}

function targetFor(item: AgentActivityItem): string | undefined {
  if (!item.detail) return undefined;
  // For search, detail is the query; for read, the URL; for code, the language.
  return item.detail;
}

function iconFor(tool: AgentActivityItem['tool'], status: AgentActivityItem['status']) {
  if (status === 'running') return <Loader2 size={15} className="agent-activity-spin" aria-hidden="true" />;
  if (status === 'error') return <AlertCircle size={15} aria-hidden="true" />;
  switch (tool) {
    case 'search': return <Search size={15} aria-hidden="true" />;
    case 'read': return <BookOpen size={15} aria-hidden="true" />;
    case 'code': return <Code2 size={15} aria-hidden="true" />;
    case 'verify': return <CheckCircle2 size={15} aria-hidden="true" />;
    case 'think': return <Sparkles size={15} aria-hidden="true" />;
    default: return <Circle size={15} aria-hidden="true" />;
  }
}

function elapsed(item: AgentActivityItem) {
  const ms = (item.completedAt ?? Date.now()) - item.startedAt;
  if (ms < 1000) return 'just now';
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

export const AgentActivity: React.FC<{
  items: AgentActivityItem[];
  compact?: boolean;
  isStreaming?: boolean;
  startedAt?: number | null;
  finishedAt?: number | null;
}> = ({ items, compact = false, isStreaming = false, startedAt, finishedAt }) => {
  const [open, setOpen] = useState(false);
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false);

  const allSources = useMemo<SourceEntry[]>(() => {
    const collected: SourceEntry[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.sources) continue;
      for (const src of item.sources) {
        if (!src.url || seen.has(src.url)) continue;
        seen.add(src.url);
        collected.push({ title: src.title, url: src.url });
      }
    }
    return collected;
  }, [items]);

  const active = useMemo(() => items.find((item) => item.status === 'running') ?? items[items.length - 1], [items]);
  if (!items.length) return null;
  const hasSources = allSources.length > 0;

  const durationMs = startedAt && finishedAt ? finishedAt - startedAt : undefined;
  const isTiming = isStreaming && startedAt !== null && finishedAt === null;

  return (
    <div className={`agent-activity ${compact ? 'compact' : ''}`} data-open={open ? 'true' : 'false'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <AgentWorkHeader
          startedAt={startedAt ?? undefined}
          durationMs={durationMs}
          isTiming={isTiming}
          expanded={open}
          onToggle={() => setOpen((v) => !v)}
          canToggle={items.length > 0}
        />
        {active && (
          <ToolBlock
            tool={toolNameFor(active) || 'tool'}
            status={active.status === 'running' ? 'running' : active.status === 'error' ? 'error' : 'done'}
            target={targetFor(active)}
          />
        )}
        {hasSources && (
          <button
            type="button"
            className="composer-toolbar-btn"
            onClick={() => setSourcesDialogOpen(true)}
            style={{ width: 'auto', padding: '0 10px', height: 26, borderRadius: 11, fontSize: 11.5, color: 'var(--text-2)' }}
            aria-label={`View all ${allSources.length} citations`}
          >
            <ExternalLink size={12} />
            {allSources.length} source{allSources.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {open && (
        <div className="agent-activity-body">
          <div className="agent-activity-timeline">
            {items.map((item) => (
              <div className="agent-activity-row" key={item.id}>
                <span className={`agent-activity-row-icon ${item.status}`}>{iconFor(item.tool, item.status)}</span>
                <div className="agent-activity-row-main">
                  <div className="agent-activity-row-title">
                    <span>{item.title}</span>
                    <span className="agent-activity-time">{elapsed(item)}</span>
                  </div>
                  {item.detail && <div className="agent-activity-row-detail">{item.detail}</div>}
                  {item.sources?.length ? (
                    <div className="agent-sources">
                      {item.sources.slice(0, 6).map((source) => (
                        <a className="agent-source" key={source.url} href={source.url} target="_blank" rel="noreferrer noopener">
                          <span className="agent-source-favicon" aria-hidden="true">↗</span>
                          <span className="agent-source-text">
                            <span className="agent-source-title">{source.title || source.url}</span>
                            <span className="agent-source-url">{source.url}</span>
                          </span>
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {hasSources && <div className="agent-activity-footer">Sources were gathered by the agent and may contain errors.</div>}
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
