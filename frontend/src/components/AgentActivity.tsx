import React, { useMemo, useState } from 'react';
import { ChevronDown, CheckCircle2, Circle, Search, BookOpen, Code2, Sparkles, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

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

export const AgentActivity: React.FC<{ items: AgentActivityItem[]; compact?: boolean }> = ({ items, compact = false }) => {
  const [open, setOpen] = useState(false);
  const active = useMemo(() => items.find((item) => item.status === 'running') ?? items[items.length - 1], [items]);
  if (!items.length) return null;
  const hasSources = items.some((item) => (item.sources?.length ?? 0) > 0);

  return (
    <div className={`agent-activity ${compact ? 'compact' : ''}`} data-open={open ? 'true' : 'false'}>
      <button type="button" className="agent-activity-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="agent-activity-icon">{active ? iconFor(active.tool, active.status) : <Sparkles size={15} />}</span>
        <span className="agent-activity-title">{active?.title || 'Working'}</span>
        {active?.detail && <span className="agent-activity-detail">{active.detail}</span>}
        <ChevronDown size={15} className="agent-activity-chevron" aria-hidden="true" />
      </button>

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
    </div>
  );
};
